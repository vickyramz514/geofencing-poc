import React, { useCallback, useEffect, useMemo, useState } from 'react';
import L, { type LatLngExpression, type Map as LeafletMap } from 'leaflet';
import { Circle, MapContainer, Marker, Polygon, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import { fetchDeviceLocation, fetchLatestLocations, fetchLocationHistory, fetchSchools } from './api';
import type { LocationRecord, PaginatedLocations, SchoolGeofence } from './api';

const PAGE_SIZE = 100;
const STALE_AFTER_MS = 5 * 60 * 1000;
type DeviceStatus = 'INSIDE' | 'OUTSIDE' | 'STALE' | 'UNAVAILABLE';
interface MapController { zoomIn: () => void; zoomOut: () => void; fitAll: () => void }
interface MapFilters { schoolId: string; deviceId: string; status: string; startDate: string; endDate: string; page: number }
const emptyHistory: PaginatedLocations = { records: [], pagination: { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 } };
const dateTime = (value?: string) => value && !Number.isNaN(new Date(value).getTime())
  ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  : 'Unavailable';
const coordinate = (lat: number, lon: number) => `${Number(lat).toFixed(6)}, ${Number(lon).toFixed(6)}`;

function escapeHtml(value: string): string {
  const replacements: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, character => replacements[character] ?? character);
}

function createDeviceIcon(status: DeviceStatus, label: string) {
  const classes: Record<DeviceStatus, string> = {
    INSIDE: 'device-marker inside',
    OUTSIDE: 'device-marker outside',
    STALE: 'device-marker stale',
    UNAVAILABLE: 'device-marker unavailable',
  };
  const safeLabel = escapeHtml(label);
  return L.divIcon({
    className: 'live-marker-shell',
    html: `<div class="device-marker-wrap"><span class="${classes[status]}">⌖</span><span class="device-marker-label" title="${safeLabel}">${safeLabel}</span></div>`,
    iconSize: [220, 34],
    iconAnchor: [15, 17],
  });
}

export function LiveLocationMap() {
  const [schools, setSchools] = useState<SchoolGeofence[]>([]);
  const [latest, setLatest] = useState<LocationRecord[]>([]);
  const [history, setHistory] = useState<PaginatedLocations>(emptyHistory);
  const [filters, setFilters] = useState<MapFilters>({ schoolId: '', deviceId: '', status: 'ALL', startDate: '', endDate: '', page: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [details, setDetails] = useState<Record<string, LocationRecord>>({});
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [mapController, setMapController] = useState<MapController | null>(null);
  const onMapReady = useCallback((controller: MapController) => setMapController(controller), []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const query = {
      schoolId: filters.schoolId || undefined,
      deviceId: filters.deviceId || undefined,
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined,
      page: filters.page,
      limit: PAGE_SIZE,
    };
    const load = async () => {
      setLoading(true);
      try {
        const [schoolResult, latestResult, historyResult] = await Promise.all([
          fetchSchools({ page: 1, limit: 100 }, controller.signal),
          fetchLatestLocations({ schoolId: query.schoolId, deviceId: query.deviceId, limit: PAGE_SIZE }, controller.signal),
          fetchLocationHistory(query, controller.signal),
        ]);
        if (controller.signal.aborted || !active) return;
        setSchools(schoolResult.records);
        setLatest(latestResult.records);
        setHistory(historyResult);
        setError('');
      } catch (cause) {
        if (!controller.signal.aborted && active) setError(cause instanceof Error ? cause.message : 'Could not load live location data.');
      } finally {
        if (!controller.signal.aborted && active) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => { active = false; controller.abort(); window.clearInterval(timer); };
  }, [filters.deviceId, filters.endDate, filters.page, filters.schoolId, filters.startDate]);

  const located = useMemo(() => latest.filter(hasCoordinates), [latest]);
  const devices = useMemo(() => {
    const seen = new Set<string>();
    return latest.filter(item => {
      const id = deviceKey(item);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [latest]);
  const statusByDevice = useMemo(() => new Map(devices.map(item => [deviceKey(item), resolveStatus(item, schools)])), [devices, schools]);
  const visibleDevices = devices.filter(item => filters.status === 'ALL' || statusByDevice.get(deviceKey(item)) === filters.status);
  const historyByDevice = useMemo(() => groupHistory(history.records), [history.records]);
  const positions: LatLngExpression[] = useMemo(() => [
    ...located.map(item => [Number(item.latitude), Number(item.longitude)] as LatLngExpression),
    ...history.records.filter(hasCoordinates).map(item => [Number(item.latitude), Number(item.longitude)] as LatLngExpression),
    ...schools.filter(hasCoordinates).map(item => [Number(item.latitude), Number(item.longitude)] as LatLngExpression),
  ], [history.records, located, schools]);
  const page = history.pagination.page ?? filters.page;
  const totalPages = history.pagination.totalPages ?? 1;
  const total = history.pagination.total ?? history.records.length;

  const setFilter = (key: keyof MapFilters, value: string | number) => setFilters(current => ({ ...current, [key]: value, ...(key === 'page' ? {} : { page: 1 }) }));
  const lookupDevice = async (item: LocationRecord) => {
    if (!item.deviceId || details[item.deviceId]) return;
    try {
      const deviceDetail = await fetchDeviceLocation(item.deviceId);
      setDetails(current => ({ ...current, [item.deviceId!]: { ...item, ...deviceDetail } }));
      setDetailErrors(current => ({ ...current, [item.deviceId!]: '' }));
    } catch (cause) {
      setDetailErrors(current => ({ ...current, [item.deviceId!]: cause instanceof Error ? cause.message : 'Device detail unavailable' }));
    }
  };

  return <section className="panel live-location-module">
    <div className="panel-header live-map-header"><div><h2>Live location tracking</h2><p>Latest device GPS with school boundaries · refreshes every 15 seconds</p></div><div className="live-map-state"><span className={error ? 'connection-dot offline' : 'connection-dot'} />{error ? 'API unavailable' : loading && !latest.length ? 'Loading' : 'Live'}</div></div>
    {error && <div className="map-error"><b>Location data unavailable</b><span>{error}</span></div>}
    <div className="live-map-filters">
      <label>School<select value={filters.schoolId} onChange={event => setFilter('schoolId', event.target.value)}><option value="">All schools</option>{schools.map(school => <option key={school.id} value={school.id}>{school.name || school.id}</option>)}</select></label>
      <label>Device<select value={filters.deviceId ?? ''} onChange={event => setFilter('deviceId', event.target.value)}><option value="">All devices</option>{devices.filter(item => item.deviceId).map(item => <option key={item.deviceId} value={item.deviceId ?? ''}>{item.deviceName || item.deviceId}</option>)}</select></label>
      <label>Status<select value={filters.status} onChange={event => setFilter('status', event.target.value)}><option value="ALL">All statuses</option><option value="INSIDE">Inside</option><option value="OUTSIDE">Outside</option><option value="STALE">Stale</option><option value="UNAVAILABLE">Unavailable</option></select></label>
      <label>History from<input type="date" value={filters.startDate} onChange={event => setFilter('startDate', event.target.value)} /></label>
      <label>History to<input type="date" value={filters.endDate} onChange={event => setFilter('endDate', event.target.value)} /></label>
      <span className="stale-note">Grey = GPS older than 5 min or unavailable</span>
    </div>
    <div className="live-map-frame">
      {positions.length ? <MapContainer center={positions[0]} zoom={14} scrollWheelZoom className="leaflet-map">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapControls positions={positions} onReady={onMapReady} />
        {schools.filter(hasCoordinates).map(school => <SchoolShape key={school.id} school={school} />)}
        {[...historyByDevice.entries()].map(([deviceId, records], index) => records.length > 1 && <Polyline key={deviceId} positions={records.map(item => [Number(item.latitude), Number(item.longitude)] as LatLngExpression)} pathOptions={{ color: historyColor(index), weight: 3, opacity: 0.62 }} />)}
        {visibleDevices.filter(hasCoordinates).map(item => {
          const id = deviceKey(item);
          const status = statusByDevice.get(id) ?? 'UNAVAILABLE';
          const detail = item.deviceId ? details[item.deviceId] : undefined;
          const school = schools.find(candidate => candidate.id === (detail?.schoolId || item.schoolId));
          const deviceName = detail?.deviceName || item.deviceName || item.deviceId || 'Unknown device';
          return <Marker key={id} position={[Number(item.latitude), Number(item.longitude)]} icon={createDeviceIcon(status, deviceName)} eventHandlers={{ click: () => void lookupDevice(item) }}>
            <Popup><div className="device-popup"><b>Device {item.deviceId || 'ID unavailable'}</b>{(detail?.deviceName || item.deviceName) && <small className="device-name">{detail?.deviceName || item.deviceName}</small>}<span className={`device-status ${status.toLowerCase()}`}>{status}</span><dl><dt>School</dt><dd>{detail?.schoolName || item.schoolName || school?.name || school?.id || 'Unavailable'}</dd><dt>Latitude</dt><dd>{Number(detail?.latitude ?? item.latitude).toFixed(6)}</dd><dt>Longitude</dt><dd>{Number(detail?.longitude ?? item.longitude).toFixed(6)}</dd><dt>GPS accuracy</dt><dd>{detail?.accuracy ?? detail?.accuracyMeters ?? item.accuracy ?? item.accuracyMeters ?? 'Unavailable'} m</dd><dt>Last updated</dt><dd>{dateTime(detail?.timestamp || item.timestamp)}</dd></dl>{item.deviceId && detailErrors[item.deviceId] && <small className="popup-note">Device detail endpoint unavailable; showing latest-location response.</small>}</div></Popup>
          </Marker>;
        })}
      </MapContainer> : <div className="map-no-coordinates">{loading ? 'Loading locations…' : 'No GPS coordinates returned for the current filters.'}</div>}
      {positions.length > 0 && <div className="map-controls"><button title="Zoom in" onClick={() => mapController?.zoomIn()}>+</button><button title="Zoom out" onClick={() => mapController?.zoomOut()}>−</button><button onClick={() => mapController?.fitAll()}>Fit all markers</button></div>}
    </div>
    <div className="live-map-legend"><span><i className="status-swatch inside" />Inside</span><span><i className="status-swatch outside" />Outside</span><span><i className="status-swatch stale" />Stale / unavailable</span><span><i className="school-swatch" />School geofence</span><small>Data source: authenticated latest location, history, and school APIs</small></div>
    <div className="history-heading"><div><b>Location history</b><small>{history.records.length} shown · {total} total</small></div><div className="history-pagination"><button disabled={page <= 1 || loading} onClick={() => setFilter('page', page - 1)}>Previous</button><span>Page {page} of {Math.max(totalPages, 1)}</span><button disabled={page >= totalPages || loading} onClick={() => setFilter('page', page + 1)}>Next</button></div></div>
    {history.records.length ? <div className="table-scroll"><table><thead><tr><th>DEVICE</th><th>SCHOOL</th><th>COORDINATES</th><th>STATUS</th><th>GPS ACCURACY</th><th>RECORDED</th></tr></thead><tbody>{history.records.map((item, index) => {
      const status = resolveStatus(item, schools);
      return <tr key={item.id || `${item.deviceId}-${item.timestamp}-${index}`}><td>{item.deviceName || item.deviceId || 'Unavailable'}</td><td>{item.schoolName || schools.find(school => school.id === item.schoolId)?.name || item.schoolId || 'Unavailable'}</td><td className="coordinates">{hasCoordinates(item) ? coordinate(item.latitude, item.longitude) : 'Unavailable'}</td><td><span className={`device-status ${status.toLowerCase()}`}>{status}</span></td><td>{item.accuracy ?? item.accuracyMeters ?? 'Unavailable'}{item.accuracy != null || item.accuracyMeters != null ? ' m' : ''}</td><td>{dateTime(item.timestamp)}</td></tr>;
    })}</tbody></table></div> : <div className="map-empty-state">{loading ? 'Loading location history…' : 'No location history matches these filters.'}</div>}
  </section>;
}

function SchoolShape({ school }: { school: SchoolGeofence }) {
  const polygons = polygonCoordinates(school);
  return <>{polygons.length ? polygons.map((positions, index) => <Polygon key={`${school.id}-polygon-${index}`} positions={positions} pathOptions={{ color: '#218267', fillColor: '#42a987', fillOpacity: 0.12, weight: 2 }} />) : Number(school.radiusMeters) > 0 ? <Circle center={[Number(school.latitude), Number(school.longitude)]} radius={Number(school.radiusMeters)} pathOptions={{ color: '#218267', fillColor: '#42a987', fillOpacity: 0.12, weight: 2 }} /> : null}<Marker position={[Number(school.latitude), Number(school.longitude)]} icon={L.divIcon({ className: 'live-marker-shell', html: '<span class="school-point-marker">S</span>', iconSize: [24, 24], iconAnchor: [12, 12] })}><Popup><b>{school.name || school.id}</b><br />{polygons.length ? 'Polygon boundary' : `${school.radiusMeters} m geofence`}<br />Presence: {school.presence || 'Unavailable'}</Popup></Marker></>;
}

function MapControls({ positions, onReady }: { positions: LatLngExpression[]; onReady: (controller: MapController) => void }) {
  const map = useMap();
  useEffect(() => {
    onReady({
      zoomIn: () => map.zoomIn(),
      zoomOut: () => map.zoomOut(),
      fitAll: () => {
        if (positions.length > 1) map.fitBounds(L.latLngBounds(positions), { padding: [32, 32], maxZoom: 16 });
        else if (positions.length === 1) map.setView(positions[0], 15);
      },
    });
  }, [map, onReady, positions]);
  useEffect(() => {
    if (positions.length > 1) map.fitBounds(L.latLngBounds(positions), { padding: [32, 32], maxZoom: 16 });
    else if (positions.length === 1) map.setView(positions[0], 15);
  }, [map, positions]);
  return null;
}

function resolveStatus(location: LocationRecord, schools: SchoolGeofence[]): DeviceStatus {
  if (!hasCoordinates(location)) return 'UNAVAILABLE';
  const recorded = location.timestamp ? new Date(location.timestamp).getTime() : NaN;
  if (!Number.isFinite(recorded) || Date.now() - recorded > STALE_AFTER_MS) return 'STALE';
  const explicit = String(location.status || '').toUpperCase();
  if (['INSIDE', 'PRESENT', 'INSIDE_GEOFENCE'].includes(explicit)) return 'INSIDE';
  if (['OUTSIDE', 'ABSENT', 'OUTSIDE_GEOFENCE'].includes(explicit)) return 'OUTSIDE';
  if (['STALE', 'GPS_STALE'].includes(explicit)) return 'STALE';
  if (['UNAVAILABLE', 'GPS_UNAVAILABLE', 'NO_GPS'].includes(explicit)) return 'UNAVAILABLE';
  const assigned = location.schoolId ? schools.filter(school => school.id === location.schoolId) : schools;
  if (!assigned.length) return 'UNAVAILABLE';
  return assigned.some(school => schoolContains(location, school)) ? 'INSIDE' : 'OUTSIDE';
}

function schoolContains(location: LocationRecord, school: SchoolGeofence): boolean {
  const shape = school.geometry ?? school.polygon;
  if (shape && typeof shape === 'object') {
    const geometry = shape as { type?: string; coordinates?: unknown };
    if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
      const ring = geometry.coordinates[0];
      if (Array.isArray(ring)) {
        const x = Number(location.longitude), y = Number(location.latitude);
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const a = ring[i], b = ring[j];
          if (!Array.isArray(a) || !Array.isArray(b)) continue;
          const crosses = (Number(a[1]) > y) !== (Number(b[1]) > y)
            && x < (Number(b[0]) - Number(a[0])) * (y - Number(a[1])) / (Number(b[1]) - Number(a[1])) + Number(a[0]);
          if (crosses) inside = !inside;
        }
        return inside;
      }
    }
  }
  return Number(school.radiusMeters) > 0 && distanceMeters(location, school) <= Number(school.radiusMeters);
}

function distanceMeters(a: LocationRecord, b: SchoolGeofence): number {
  const radians = (degree: number) => degree * Math.PI / 180;
  const lat1 = radians(Number(a.latitude));
  const lat2 = radians(Number(b.latitude));
  const dLat = lat2 - lat1;
  const dLon = radians(Number(b.longitude) - Number(a.longitude));
  const haversine = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function polygonCoordinates(school: SchoolGeofence): LatLngExpression[][][] {
  const shape = school.geometry ?? school.polygon;
  if (!shape || typeof shape !== 'object') return [];
  const geo = shape as { type?: string; coordinates?: unknown };
  if (!Array.isArray(geo.coordinates)) return [];
  const rings = (raw: unknown): LatLngExpression[][] => Array.isArray(raw)
    ? raw.filter(Array.isArray).map(ring => ring.filter(Array.isArray).map(pair => [Number(pair[1]), Number(pair[0])] as LatLngExpression))
    : [];
  if (geo.type === 'Polygon') return [rings(geo.coordinates)];
  return geo.type === 'MultiPolygon' ? geo.coordinates.filter(Array.isArray).map(rings) : [];
}

function hasCoordinates(item: { latitude: number; longitude: number }): boolean { return Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)); }
function deviceKey(item: LocationRecord): string { return item.deviceId || item.id || `${item.timestamp || 'no-time'}:${item.latitude}:${item.longitude}`; }
function historyColor(index: number): string { return ['#2678c4', '#bd7040', '#805db7', '#258468', '#c24f5b'][index % 5]; }
function groupHistory(records: LocationRecord[]): Map<string, LocationRecord[]> {
  const grouped = new Map<string, LocationRecord[]>();
  records.forEach(record => { const key = record.deviceId || 'device-unavailable'; grouped.set(key, [...(grouped.get(key) ?? []), record]); });
  return grouped;
}
