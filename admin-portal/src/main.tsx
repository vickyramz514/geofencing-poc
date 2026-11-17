import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import L, { type LatLngExpression } from 'leaflet';
import { Circle, CircleMarker, MapContainer, Marker, Polygon, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import { adminDataUrl, apiBaseUrl, downloadCsv, exportGeofenceEvents, fetchAdminData } from './api';
import type { AdminData, GeofenceEvent, LocationRecord, SchoolGeofence } from './api';
import { LiveLocationMap } from './LiveLocationMap';
import { DeviceManagementPage } from './DeviceManagementPage';
import { GeofenceEventsPage as ApiGeofenceEventsPage } from './GeofenceEventsPage';
import { LocationHistoryPage as ApiLocationHistoryPage } from './LocationHistoryPage';
import 'leaflet/dist/leaflet.css';
import './styles.css';

const SchoolGeofencesManager = lazy(() => import('./SchoolGeofencesManager').then(module => ({ default: module.SchoolGeofencesManager })));

type Section = 'Overview' | 'Live GPS map' | 'School geofences' | 'Devices' | 'Geofence events' | 'Location history' | 'Deliveries' | 'Reports';
const EMPTY_DATA: AdminData = {
  offices: [], locations: [], events: [], deliveries: [], devices: [],
  locationPage: {}, eventPage: {}, deliveryPage: {}, office: null, presence: 'UNKNOWN',
  dashboard: {
    generatedAt: '', definitions: { activeDeviceWindowHours: 24, staleGpsMinutes: 15, eventDayTimezone: 'UTC', presenceSource: '' },
    metrics: { totalRegisteredDevices: 0, activeDevices: 0, totalSchools: 0, totalConfiguredGeofences: 0, devicesInsideGeofences: 0, devicesOutsideGeofences: 0, todaysEntryEvents: 0, todaysExitEvents: 0, devicesWithStaleGps: 0 },
    latestGpsLocations: { records: [], pagination: {} },
    devicesInsideGeofences: { data: [], pagination: {} }, devicesOutsideGeofences: { data: [], pagination: {} }, staleDevices: { data: [], pagination: {} },
  },
};
const navItems: Array<[Section, string]> = [
  ['Overview', '▦'], ['Live GPS map', '⌖'], ['School geofences', '⌂'], ['Devices', '♙'],
  ['Geofence events', '⌁'], ['Location history', '◷'], ['Deliveries', '↗'], ['Reports', '▤'],
];
const dateTime = (value?: string) => value && !Number.isNaN(new Date(value).getTime())
  ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';
const timeAgo = (value?: string) => {
  if (!value) return 'No activity yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const mins = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  return mins < 1 ? 'Just now' : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;
};
const coordinate = (lat: number, lon: number) => `${Number(lat).toFixed(5)}, ${Number(lon).toFixed(5)}`;
const schoolId = (event: GeofenceEvent) => event.schoolName ? `${event.schoolName} (${event.schoolId})` : event.schoolId;
const mapIcon = (className: string, text: string) => L.divIcon({
  className: 'map-marker-shell', html: `<span class="${className}">${text}</span>`,
  iconSize: [26, 26], iconAnchor: [13, 13],
});
const schoolIcon = mapIcon('school-map-marker', '⌂');
const latestIcon = mapIcon('latest-map-marker', '⌖');
const enterIcon = mapIcon('event-map-marker enter-map-marker', '↘');
const exitIcon = mapIcon('event-map-marker exit-map-marker', '↗');

function App() {
  const [data, setData] = useState<AdminData>(EMPTY_DATA);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [section, setSection] = useState<Section>('Overview');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const connected = !error && lastSync !== null;

  async function refresh(signal?: AbortSignal) {
    try {
      const next = await fetchAdminData(signal);
      setData(next);
      setLastSync(new Date());
      setError('');
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(cause instanceof Error ? cause.message : `Could not load admin data from ${adminDataUrl}.`);
    } finally {
      if (!signal?.aborted) setLoaded(true);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, []);

  const locations = useMemo(() => data.locations.slice().sort((a, b) => timeValue(a.timestamp) - timeValue(b.timestamp)), [data.locations]);
  const events = useMemo(() => data.events.slice().sort((a, b) => timeValue(a.eventTime) - timeValue(b.eventTime)), [data.events]);
  const latest = locations.at(-1);
  const todayEvents = events.filter(event => isToday(event.eventTime));
  const presentCount = data.offices.filter(item => ['PRESENT', 'INSIDE'].includes(String(item.presence).toUpperCase())).length;
  const filteredLocations = locations.filter(item => {
    return inDateRange(item.timestamp, fromDate, toDate);
  }).reverse();

  const exportEvents = () => void exportGeofenceEvents({ from: fromDate ? `${fromDate}T00:00:00.000Z` : undefined, to: toDate ? `${toDate}T23:59:59.999Z` : undefined });
  const exportLocations = () => downloadCsv('location-history.csv', [
    ['Device ID', 'Latitude', 'Longitude', 'Accuracy', 'Heading', 'Timestamp', 'Received at'],
    ...filteredLocations.map(item => [item.deviceId, item.latitude, item.longitude, item.accuracy ?? item.accuracyMeters, item.heading, item.timestamp, item.receivedAt]),
  ]);
  const exportReport = () => {
    const reportRows: unknown[][] = [['Record type', 'ID', 'Name / school', 'Status / event', 'Latitude', 'Longitude', 'Time']];
    data.offices.forEach(item => reportRows.push(['Geofence', item.id, item.name, item.presence, item.latitude, item.longitude, item.presenceUpdatedAt]));
    locations.filter(item => inDateRange(item.timestamp, fromDate, toDate)).forEach(item => reportRows.push(['Location', item.deviceId, '', '', item.latitude, item.longitude, item.timestamp]));
    events.filter(item => inDateRange(item.eventTime, fromDate, toDate)).forEach(item => reportRows.push(['Geofence event', item.eventId, item.schoolName ?? item.schoolId, item.eventType, item.latitude, item.longitude, item.eventTime]));
    data.deliveries.filter(item => inDateRange(item.updatedAt ?? item.receivedAt, fromDate, toDate)).forEach(item => reportRows.push(['Delivery', item.deliveryId, item.schoolName ?? item.schoolId, item.status, '', '', item.updatedAt ?? item.receivedAt]));
    downloadCsv('geofencing-report.csv', reportRows);
  };

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">G</span><span>Geofence<span className="brand-dot"> Admin</span></span></div>
      <div className="workspace-label">DATA SOURCE</div>
      <div className="workspace"><div className="workspace-icon">API</div><div><b>Geofencing API</b><small>{apiBaseUrl}</small></div></div>
      <div className="nav-label">OPERATIONS</div>
      <nav>{navItems.map(([name, icon]) => <button key={name} className={`nav-item ${section === name ? 'selected' : ''}`} onClick={() => setSection(name)}><span className="nav-icon">{icon}</span>{name}{name === 'Geofence events' && <span className="nav-count">{data.eventPage.total ?? data.events.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="connection-card"><span className={connected ? 'connection-dot' : 'connection-dot offline'}></span><div><b>{connected ? 'API connected' : error ? 'API unavailable' : 'Connecting to API'}</b><small>{lastSync ? `Synced ${timeAgo(lastSync.toISOString())}` : 'Waiting for first sync'}</small></div></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="crumb">Geofencing <span>/</span> <b>{section}</b></div><div className="top-actions"><div className="api-indicator"><i className={connected ? '' : 'offline'}></i>{connected ? 'API connected' : error ? 'API disconnected' : 'Connecting'}</div></div></header>
      <div className="content">
        {error && <div className="error-banner"><span>⚠</span><div><b>Data connection unavailable</b><small>{error}</small></div><button onClick={() => void refresh()}>Retry</button></div>}
      <div className="page-heading"><div><div className="eyebrow">{new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}</div><h1>{section}</h1><p>{sectionDescription(section)}</p></div><div className="heading-actions"><div className="sync-status"><span className="sync-dot"></span>Updated {lastSync ? timeAgo(lastSync.toISOString()) : '—'}</div><button className="button secondary" onClick={() => void refresh()}><span className="refresh">⟳</span> Refresh</button>{!['Geofence events', 'Location history'].includes(section) && <button className="button primary" onClick={exportReport}><span>↓</span> Export CSV</button>}</div></div>
        {!loaded && !error ? <LoadingState /> : <>
          {section === 'Overview' && <Overview data={data} latest={latest} todayEvents={todayEvents} presentCount={presentCount} locations={locations} onOpen={setSection} />}
          {section === 'Live GPS map' && <LiveLocationMap />}
          {section === 'School geofences' && <Suspense fallback={<LoadingState />}><SchoolGeofencesManager /></Suspense>}
          {section === 'Devices' && <DeviceManagementPage />}
          {section === 'Geofence events' && <ApiGeofenceEventsPage schools={data.offices} />}
          {section === 'Location history' && <ApiLocationHistoryPage schools={data.offices} />}
          {section === 'Deliveries' && <DeliveriesPage deliveries={data.deliveries.slice().reverse()} loaded={loaded} total={data.deliveryPage.total} />}
          {section === 'Reports' && <ReportsPage data={data} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} onExport={exportReport} />}
        </>}
        <footer><span>Geofencing Admin</span><span>Auto-refreshes every 15 seconds <i className="live-dot" /></span><span>Last sync {lastSync ? dateTime(lastSync.toISOString()) : '—'}</span></footer>
      </div>
    </main>
  </div>;
}

function Overview({ data, latest, todayEvents, presentCount, locations, onOpen }: { data: AdminData; latest?: LocationRecord; todayEvents: GeofenceEvent[]; presentCount: number; locations: LocationRecord[]; onOpen: (section: Section) => void }) {
  const metrics = data.dashboard.metrics;
  return <>
    <div className="stat-grid">
      <Stat title="Registered devices" value={metrics.totalRegisteredDevices} note={`${metrics.activeDevices} active`} icon="♙" tone="blue" badge="DEVICES" />
      <Stat title="Schools" value={metrics.totalSchools} note={`${metrics.totalConfiguredGeofences} configured geofences`} icon="⌂" tone="amber" badge="SCHOOLS" />
      <Stat title="Inside geofences" value={metrics.devicesInsideGeofences} note="Based on latest GPS fixes" icon="◉" tone="green" badge="INSIDE" />
      <Stat title="Outside geofences" value={metrics.devicesOutsideGeofences} note={`${metrics.devicesWithStaleGps} devices have stale GPS`} icon="⌖" tone="violet" badge="GPS" />
      <Stat title="Today's entries" value={metrics.todaysEntryEvents} note="UTC calendar day" icon="↘" tone="green" badge="ENTER" />
      <Stat title="Today's exits" value={metrics.todaysExitEvents} note="UTC calendar day" icon="↗" tone="amber" badge="EXIT" />
      <Stat title="Latest GPS updates" value={data.dashboard.latestGpsLocations.pagination.total ?? data.dashboard.latestGpsLocations.records.length} note={latest ? timeAgo(latest.timestamp) : 'No GPS updates received'} icon="⌖" tone="blue" badge="LATEST" />
    </div>
    <div className="dashboard-grid">
      <section className="panel map-panel"><PanelHeader title="Live geofence map" subtitle="GPS history, school fences, and event locations" action="Open map" onAction={() => onOpen('Live GPS map')} /><TrackingMap offices={data.offices} office={data.office} locations={locations} events={data.events} latest={latest} /><MapLegend /></section>
      <section className="panel activity-panel"><PanelHeader title="Geofence activity" subtitle="Recent events from the current history page" /><ActivityChart events={todayEvents} /><div className="activity-summary"><span className="activity-key"><i className="enter-key" />Today's entries (UTC)</span><b>{metrics.todaysEntryEvents}</b><span className="activity-key"><i className="exit-key" />Today's exits (UTC)</span><b>{metrics.todaysExitEvents}</b></div></section>
    </div>
    <div className="lower-grid"><section className="panel"><PanelHeader title="School geofences" subtitle="Configured locations and presence" action="Manage" onAction={() => onOpen('School geofences')} />{data.offices.length ? <OfficeList offices={data.offices.slice(0, 4)} /> : <EmptyState loaded title="No school geofences returned" detail="The API returned no configured school locations." />}</section><section className="panel"><PanelHeader title="Recent geofence events" subtitle="Latest entry and exit activity" action="View all" onAction={() => onOpen('Geofence events')} />{data.events.length ? <EventsTable events={data.events.slice().reverse().slice(0, 4)} /> : <EmptyState loaded title="No geofence events" detail="Entry and exit events will appear when reported by the API." />}</section></div>
  </>;
}

function DeliveriesPage({ deliveries, loaded, total }: { deliveries: AdminData['deliveries']; loaded: boolean; total?: number }) {
  return <section className="panel page-panel"><PanelHeader title="Delivery status history" subtitle={`${deliveries.length} loaded${total != null ? ` of ${total} total` : ''}`} />{deliveries.length ? <div className="table-scroll"><table><thead><tr><th>SCHOOL</th><th>DELIVERY</th><th>STATUS</th><th>UPDATED</th></tr></thead><tbody>{deliveries.map((item, i) => <tr key={`${item.deliveryId}-${i}`}><td>{item.schoolName || item.schoolId}</td><td>{item.deliveryId || '—'}</td><td><span className="status-pill">{item.status || '—'}</span></td><td>{dateTime(item.updatedAt || item.receivedAt)}</td></tr>)}</tbody></table></div> : <EmptyState loaded={loaded} title="No delivery updates" detail="The API returned no delivery status records." />}</section>;
}

function ReportsPage({ data, fromDate, toDate, setFromDate, setToDate, onExport }: { data: AdminData; fromDate: string; toDate: string; setFromDate: (value: string) => void; setToDate: (value: string) => void; onExport: () => void }) {
  const locationCount = data.locations.filter(item => inDateRange(item.timestamp, fromDate, toDate)).length;
  const eventCount = data.events.filter(item => inDateRange(item.eventTime, fromDate, toDate)).length;
  const deliveryCount = data.deliveries.filter(item => inDateRange(item.updatedAt || item.receivedAt, fromDate, toDate)).length;
  return <><section className="panel page-panel"><PanelHeader title="Reports" subtitle="Filter available API records by date and export a combined CSV" action="Download report" onAction={onExport} /><DateRange fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} /><div className="stat-grid report-stats"><Stat title="Location records" value={locationCount} note="In selected date range" icon="⌖" tone="blue" badge="DATA" /><Stat title="Geofence events" value={eventCount} note="In selected date range" icon="◎" tone="violet" badge="DATA" /><Stat title="Delivery updates" value={deliveryCount} note="In selected date range" icon="↗" tone="amber" badge="DATA" /><Stat title="School geofences" value={data.offices.length} note="Current configured total" icon="⌂" tone="green" badge="CURRENT" /></div><p className="api-readonly-note">The report includes records currently returned by the API. A response with pagination may contain only the current page; totals are shown in the relevant history views.</p></section></>;
}

function TrackingMap({ offices, office, locations, events, latest }: { offices: SchoolGeofence[]; office: AdminData['office']; locations: LocationRecord[]; events: GeofenceEvent[]; latest?: LocationRecord }) {
  const gps = locations.filter(validCoordinates).slice(-250);
  const fences = offices.filter(validCoordinates);
  if (office && validCoordinates(office)) fences.push({ ...office, id: 'office', name: 'Office area' });
  const eventPoints = events.filter(validCoordinates);
  const positions: LatLngExpression[] = [...gps, ...fences, ...eventPoints].map(point => [Number(point.latitude), Number(point.longitude)]);
  if (!positions.length) return <div className="map-canvas map-empty">The API has no GPS, school, or event coordinates to map.</div>;
  const anchor = latest && validCoordinates(latest) ? latest : fences[0] ?? gps[0] ?? eventPoints[0];
  const center: LatLngExpression = [Number(anchor.latitude), Number(anchor.longitude)];
  return <div className="map-canvas leaflet-canvas"><MapContainer center={center} zoom={14} scrollWheelZoom className="leaflet-map">
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    <FitMapBounds positions={positions} />
    {fences.map((item, i) => {
      const polygons = polygonSets(item);
      return <React.Fragment key={item.id || i}>{polygons.length ? polygons.map((polygon, polygonIndex) => <Polygon key={`${item.id}-polygon-${polygonIndex}`} positions={polygon} pathOptions={{ color: '#228467', fillColor: '#42a987', fillOpacity: 0.12, weight: 2 }} />) : Number(item.radiusMeters) > 0 ? <Circle center={[Number(item.latitude), Number(item.longitude)]} radius={Number(item.radiusMeters)} pathOptions={{ color: '#228467', fillColor: '#42a987', fillOpacity: 0.12, weight: 2 }} /> : null}<Marker position={[Number(item.latitude), Number(item.longitude)]} icon={schoolIcon}><Popup><b>{item.name || item.id}</b><br />{polygons.length ? 'Polygon geofence' : `${item.radiusMeters} m radius`}<br />Presence: {item.presence || 'Unknown'}<br />Device: {item.deviceId || 'Not assigned'}</Popup></Marker></React.Fragment>;
    })}
    {gps.length > 1 && <Polyline positions={gps.map(item => [Number(item.latitude), Number(item.longitude)] as LatLngExpression)} pathOptions={{ color: '#327ec4', weight: 3, opacity: 0.75 }} />}
    {gps.slice(0, -1).map((point, i) => <CircleMarker key={`gps-${point.timestamp}-${i}`} center={[Number(point.latitude), Number(point.longitude)]} radius={4} pathOptions={{ color: '#fff', weight: 1, fillColor: '#77a9cd', fillOpacity: 0.95 }}><Popup>GPS update<br />{coordinate(point.latitude, point.longitude)}<br />{dateTime(point.timestamp)}</Popup></CircleMarker>)}
    {latest && validCoordinates(latest) && <Marker position={[Number(latest.latitude), Number(latest.longitude)]} icon={latestIcon}><Popup><b>Latest GPS fix</b><br />{coordinate(latest.latitude, latest.longitude)}<br />Accuracy: ±{latest.accuracy ?? latest.accuracyMeters ?? '—'} m<br />{dateTime(latest.timestamp)}<br />Device: {latest.deviceId || 'Not provided'}</Popup></Marker>}
    {eventPoints.map((item, i) => <Marker key={item.eventId || `event-${i}`} position={[Number(item.latitude), Number(item.longitude)]} icon={item.eventType === 'ENTER' ? enterIcon : exitIcon}><Popup><b>{item.eventType || 'Geofence event'} · {item.schoolName || item.schoolId}</b><br />{coordinate(item.latitude, item.longitude)}<br />{dateTime(item.eventTime)}</Popup></Marker>)}
  </MapContainer></div>;
}

function FitMapBounds({ positions }: { positions: LatLngExpression[] }) {
  const map = useMap();
  const boundsKey = positions.map(point => JSON.stringify(point)).join('|');
  useEffect(() => {
    if (positions.length > 1) map.fitBounds(L.latLngBounds(positions), { padding: [24, 24], maxZoom: 16 });
    else if (positions.length === 1) map.setView(positions[0], 15);
  }, [map, boundsKey, positions.length]);
  return null;
}

function MapLegend() { return <div className="map-legend"><span><i className="legend-blue" />GPS fixes</span><span><i className="legend-ring" />School radius</span><span><i className="legend-enter" />ENTER</span><span><i className="legend-exit" />EXIT</span><span className="map-coord">OpenStreetMap</span></div>; }
function OfficeList({ offices, detailed = false }: { offices: SchoolGeofence[]; detailed?: boolean }) { return <div className="office-list">{offices.map(item => <div className="office-row" key={item.id}><span className="office-marker">⌂</span><div className="office-info"><b>{item.name || item.id}</b><small>{coordinate(item.latitude, item.longitude)} · {item.radiusMeters}m radius{item.deviceId ? ` · Device ${item.deviceId}` : ''}</small></div><span className={`presence-pill ${['PRESENT', 'INSIDE'].includes(String(item.presence).toUpperCase()) ? 'present' : ''}`}>{item.presence || 'UNKNOWN'}</span>{detailed && <span className="office-updated">{item.presenceUpdatedAt ? timeAgo(item.presenceUpdatedAt) : 'No presence update'}</span>}</div>)}</div>; }
function EventsTable({ events }: { events: GeofenceEvent[] }) { return <div className="table-scroll"><table><thead><tr><th>EVENT</th><th>SCHOOL</th><th>TYPE</th><th>COORDINATES</th><th>TIME</th></tr></thead><tbody>{events.map((event, i) => <tr key={event.eventId || i}><td><span className="event-id">{event.eventId || '—'}</span></td><td><span className="table-location"><b>{event.schoolName || event.schoolId}</b>{event.schoolName && <small>{event.schoolId}</small>}</span></td><td><span className={`event-pill ${event.eventType === 'ENTER' ? 'enter' : 'exit'}`}><i />{event.eventType || '—'}</span></td><td className="coordinates">{coordinate(event.latitude, event.longitude)}</td><td>{dateTime(event.eventTime)}</td></tr>)}</tbody></table></div>; }
function ActivityChart({ events }: { events: GeofenceEvent[] }) {
  if (!events.length) return <div className="chart-empty">No geofence events recorded today.</div>;
  const counts = Array.from({ length: 12 }, (_, i) => ({ hour: i * 2, enter: 0, exit: 0 }));
  events.forEach(event => { const hour = new Date(event.eventTime || '').getHours(); const bucket = counts[Math.floor(hour / 2)]; if (bucket && (event.eventType === 'ENTER' || event.eventType === 'EXIT')) bucket[event.eventType.toLowerCase() as 'enter' | 'exit'] += 1; });
  const max = Math.max(1, ...counts.map(item => item.enter + item.exit));
  return <div className="chart-wrap"><div className="chart-y"><span>{max}</span><span>{Math.ceil(max / 2)}</span><span>0</span></div><div className="chart"><div className="chart-gridline one"/><div className="chart-gridline two"/><div className="chart-gridline three"/><div className="bars">{counts.map(item => <div className="bar-group" key={item.hour}><div className="bar-pair"><i className="bar-enter" style={{ height: `${item.enter / max * 100}%` }} /><i className="bar-exit" style={{ height: `${item.exit / max * 100}%` }} /></div><span>{String(item.hour).padStart(2, '0')}</span></div>)}</div></div></div>;
}
function Stat({ title, value, note, icon, tone, badge }: { title: string; value: string | number; note: string; icon: string; tone: string; badge: string }) { return <section className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><span className={`stat-badge ${tone}`}>{badge}</span><div className="stat-title">{title}</div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></section>; }
function PanelHeader({ title, subtitle, action, onAction }: { title: string; subtitle: string; action?: string; onAction?: () => void }) { return <div className="panel-header"><div><h2>{title}</h2><p>{subtitle}</p></div>{action && <button className="text-link" onClick={onAction}>{action} <span>→</span></button>}</div>; }
function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) { return <label className="search"><span>⌕</span><input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} /></label>; }
function DateRange({ fromDate, toDate, setFromDate, setToDate }: { fromDate: string; toDate: string; setFromDate: (value: string) => void; setToDate: (value: string) => void }) { return <div className="date-range"><label>From <input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} /></label><label>To <input type="date" value={toDate} onChange={event => setToDate(event.target.value)} /></label></div>; }
function DataFact({ label, value, detail }: { label: string; value: string | number; detail: string }) { return <div className="data-fact"><small>{label}</small><b>{value}</b><span>{detail}</span></div>; }
function EmptyState({ loaded, title, detail }: { loaded: boolean; title: string; detail: string }) { return <div className="empty-state"><div className="empty-icon">⌖</div><b>{loaded ? title : 'Loading activity…'}</b><span>{loaded ? detail : 'Connecting to your tracking API.'}</span></div>; }
function LoadingState() { return <div className="panel loading-panel"><div className="spinner"/><b>Loading geofencing data</b><span>Connecting to the admin API…</span></div>; }
function validCoordinates(item: { latitude: number; longitude: number }): boolean { return Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)); }
function polygonSets(item: SchoolGeofence): LatLngExpression[][][] {
  const geometry = item.geometry ?? item.polygon;
  if (!geometry || typeof geometry !== 'object') return [];
  const value = geometry as { type?: string; coordinates?: unknown };
  if (!Array.isArray(value.coordinates)) return [];
  const toRings = (polygon: unknown): LatLngExpression[][] => Array.isArray(polygon)
    ? polygon.filter(Array.isArray).map(ring => ring.filter(Array.isArray).map(pair => [Number(pair[1]), Number(pair[0])] as LatLngExpression))
    : [];
  if (value.type === 'Polygon') return [toRings(value.coordinates)];
  if (value.type === 'MultiPolygon') return value.coordinates.filter(Array.isArray).map(toRings);
  return [];
}
function timeValue(value?: string): number { const result = value ? new Date(value).getTime() : 0; return Number.isFinite(result) ? result : 0; }
function isToday(value?: string): boolean { return Boolean(value && new Date(value).toDateString() === new Date().toDateString()); }
function inDateRange(value: string | undefined, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!value || Number.isNaN(new Date(value).getTime())) return false;
  const time = new Date(value).getTime();
  return (!from || time >= new Date(`${from}T00:00:00`).getTime()) && (!to || time <= new Date(`${to}T23:59:59.999`).getTime());
}
function sectionDescription(section: Section): string {
  const copy: Record<Section, string> = {
    Overview: 'Tracking activity reported by the connected application.',
    'Live GPS map': 'Inspect latest GPS fixes, movement history, geofences, and transition events.',
    'School geofences': 'Review configured school circles, current presence, and assigned devices.',
    Devices: 'Review devices included in the API response or assigned to school locations.',
    'Geofence events': 'Search and export entry and exit events reported by the mobile application.',
    'Location history': 'Browse GPS updates with timestamps, accuracy, and coordinates.',
    Deliveries: 'Review delivery status updates reported by the application.',
    Reports: 'Filter available records by date and export an operations report.',
  };
  return copy[section];
}

createRoot(document.getElementById('root')!).render(<App />);
