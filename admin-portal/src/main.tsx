import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import L, { type LatLngExpression } from 'leaflet';
import { Circle, CircleMarker, MapContainer, Marker, Polygon, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import { adminDataUrl, apiBaseUrl, downloadCsv, fetchAdminData } from './api';
import type { AdminData, DeviceRecord, GeofenceEvent, LocationRecord, SchoolGeofence } from './api';
import { LiveLocationMap } from './LiveLocationMap';
import 'leaflet/dist/leaflet.css';
import './styles.css';

type Section = 'Overview' | 'Live GPS map' | 'School geofences' | 'Devices' | 'Geofence events' | 'Location history' | 'Deliveries' | 'Reports';
const EMPTY_DATA: AdminData = {
  offices: [], locations: [], events: [], deliveries: [], devices: [],
  locationPage: {}, eventPage: {}, deliveryPage: {}, office: null, presence: 'UNKNOWN',
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
  const [search, setSearch] = useState('');
  const [eventType, setEventType] = useState('All events');
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
      setError(`Could not load admin data from ${adminDataUrl}. Check the API URL and server.`);
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
  const filteredEvents = events.filter(event => {
    const matchesText = `${event.schoolName ?? ''} ${event.schoolId} ${event.eventType} ${event.eventId ?? ''}`.toLowerCase().includes(search.toLowerCase());
    return matchesText && (eventType === 'All events' || event.eventType === eventType.toUpperCase());
  }).reverse();
  const filteredLocations = locations.filter(item => {
    const matchesText = `${item.deviceId ?? ''} ${item.latitude} ${item.longitude}`.toLowerCase().includes(search.toLowerCase());
    return matchesText && inDateRange(item.timestamp, fromDate, toDate);
  }).reverse();
  const filteredOffices = data.offices.filter(item => `${item.name ?? ''} ${item.id} ${item.deviceId ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const devices = useMemo(() => {
    if (data.devices.length) return data.devices;
    const assigned = new Map<string, DeviceRecord>();
    data.offices.forEach(office => {
      if (office.deviceId) assigned.set(office.deviceId, { id: office.deviceId, schoolId: office.id, lastSeen: office.presenceUpdatedAt ?? undefined });
    });
    data.locations.forEach(location => {
      if (location.deviceId && !assigned.has(location.deviceId)) assigned.set(location.deviceId, { id: location.deviceId, lastSeen: location.timestamp });
    });
    data.events.forEach(event => {
      if (event.deviceId && !assigned.has(event.deviceId)) assigned.set(event.deviceId, { id: event.deviceId, schoolId: event.schoolId, lastSeen: event.eventTime });
    });
    return [...assigned.values()];
  }, [data.devices, data.events, data.locations, data.offices]);

  const exportEvents = () => downloadCsv('geofence-events.csv', [
    ['Event ID', 'School', 'School ID', 'Type', 'Latitude', 'Longitude', 'Accuracy', 'Event time', 'Received at'],
    ...filteredEvents.map(item => [item.eventId, item.schoolName, item.schoolId, item.eventType, item.latitude, item.longitude, item.accuracy, item.eventTime, item.receivedAt]),
  ]);
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
      <nav>{navItems.map(([name, icon]) => <button key={name} className={`nav-item ${section === name ? 'selected' : ''}`} onClick={() => { setSection(name); setSearch(''); }}><span className="nav-icon">{icon}</span>{name}{name === 'Geofence events' && <span className="nav-count">{data.events.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="connection-card"><span className={connected ? 'connection-dot' : 'connection-dot offline'}></span><div><b>{connected ? 'API connected' : error ? 'API unavailable' : 'Connecting to API'}</b><small>{lastSync ? `Synced ${timeAgo(lastSync.toISOString())}` : 'Waiting for first sync'}</small></div></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="crumb">Geofencing <span>/</span> <b>{section}</b></div><div className="top-actions"><div className="api-indicator"><i className={connected ? '' : 'offline'}></i>{connected ? 'API connected' : error ? 'API disconnected' : 'Connecting'}</div></div></header>
      <div className="content">
        {error && <div className="error-banner"><span>⚠</span><div><b>Data connection unavailable</b><small>{error}</small></div><button onClick={() => void refresh()}>Retry</button></div>}
        <div className="page-heading"><div><div className="eyebrow">{new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}</div><h1>{section}</h1><p>{sectionDescription(section)}</p></div><div className="heading-actions"><div className="sync-status"><span className="sync-dot"></span>Updated {lastSync ? timeAgo(lastSync.toISOString()) : '—'}</div><button className="button secondary" onClick={() => void refresh()}><span className="refresh">⟳</span> Refresh</button><button className="button primary" onClick={section === 'Location history' ? exportLocations : section === 'Geofence events' ? exportEvents : exportReport}><span>↓</span> Export CSV</button></div></div>
        {!loaded && !error ? <LoadingState /> : <>
          {section === 'Overview' && <Overview data={data} latest={latest} todayEvents={todayEvents} presentCount={presentCount} locations={locations} onOpen={setSection} />}
          {section === 'Live GPS map' && <LiveLocationMap />}
          {section === 'School geofences' && <SchoolPage offices={filteredOffices} query={search} setQuery={setSearch} onExport={() => downloadCsv('school-geofences.csv', [['ID', 'School', 'Latitude', 'Longitude', 'Radius (m)', 'Presence', 'Device ID', 'Presence updated'], ...filteredOffices.map(item => [item.id, item.name, item.latitude, item.longitude, item.radiusMeters, item.presence, item.deviceId, item.presenceUpdatedAt])])} loaded={loaded} />}
          {section === 'Devices' && <DevicesPage devices={devices} loaded={loaded} />}
          {section === 'Geofence events' && <EventsPage events={filteredEvents} query={search} setQuery={setSearch} eventType={eventType} setEventType={setEventType} onExport={exportEvents} loaded={loaded} total={data.eventPage.total} />}
          {section === 'Location history' && <LocationsPage locations={filteredLocations} query={search} setQuery={setSearch} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} onExport={exportLocations} loaded={loaded} total={data.locationPage.total} />}
          {section === 'Deliveries' && <DeliveriesPage deliveries={data.deliveries.slice().reverse()} loaded={loaded} total={data.deliveryPage.total} />}
          {section === 'Reports' && <ReportsPage data={data} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} onExport={exportReport} />}
        </>}
        <footer><span>Geofencing Admin</span><span>Auto-refreshes every 15 seconds <i className="live-dot" /></span><span>Last sync {lastSync ? dateTime(lastSync.toISOString()) : '—'}</span></footer>
      </div>
    </main>
  </div>;
}

function Overview({ data, latest, todayEvents, presentCount, locations, onOpen }: { data: AdminData; latest?: LocationRecord; todayEvents: GeofenceEvent[]; presentCount: number; locations: LocationRecord[]; onOpen: (section: Section) => void }) {
  return <>
    <div className="stat-grid">
      <Stat title="Location updates" value={data.locationPage.total ?? data.locations.length} note={latest ? timeAgo(latest.timestamp) : 'No GPS updates received'} icon="⌖" tone="blue" badge="HISTORY" />
      <Stat title="Geofence events" value={data.eventPage.total ?? data.events.length} note={`${todayEvents.length} recorded today`} icon="◎" tone="violet" badge="TODAY" />
      <Stat title="School geofences" value={data.offices.length || '—'} note="Configured locations from API" icon="⌂" tone="amber" badge="SCHOOLS" />
      <Stat title="Currently present" value={data.offices.length ? presentCount : '—'} note={data.offices.length ? `Across ${data.offices.length} school locations` : 'Presence data unavailable'} icon="◉" tone="green" badge="LIVE" />
    </div>
    <div className="dashboard-grid">
      <section className="panel map-panel"><PanelHeader title="Live geofence map" subtitle="GPS history, school fences, and event locations" action="Open map" onAction={() => onOpen('Live GPS map')} /><TrackingMap offices={data.offices} office={data.office} locations={locations} events={data.events} latest={latest} /><MapLegend /></section>
      <section className="panel activity-panel"><PanelHeader title="Geofence activity" subtitle="Events recorded today" /><ActivityChart events={todayEvents} /><div className="activity-summary"><span className="activity-key"><i className="enter-key" />Entries</span><b>{todayEvents.filter(event => event.eventType === 'ENTER').length}</b><span className="activity-key"><i className="exit-key" />Exits</span><b>{todayEvents.filter(event => event.eventType === 'EXIT').length}</b></div></section>
    </div>
    <div className="lower-grid"><section className="panel"><PanelHeader title="School geofences" subtitle="Configured locations and presence" action="Manage" onAction={() => onOpen('School geofences')} />{data.offices.length ? <OfficeList offices={data.offices.slice(0, 4)} /> : <EmptyState loaded title="No school geofences returned" detail="The API returned no configured school locations." />}</section><section className="panel"><PanelHeader title="Recent geofence events" subtitle="Latest entry and exit activity" action="View all" onAction={() => onOpen('Geofence events')} />{data.events.length ? <EventsTable events={data.events.slice().reverse().slice(0, 4)} /> : <EmptyState loaded title="No geofence events" detail="Entry and exit events will appear when reported by the API." />}</section></div>
  </>;
}

function SchoolPage({ offices, query, setQuery, onExport, loaded }: { offices: SchoolGeofence[]; query: string; setQuery: (value: string) => void; onExport: () => void; loaded: boolean }) {
  return <section className="panel page-panel"><PanelHeader title="School geofence management" subtitle="Configured school locations and presence reported by the API" action="Export CSV" onAction={onExport} /><SearchInput value={query} onChange={setQuery} placeholder="Search schools, IDs, or device IDs" />{offices.length ? <OfficeList offices={offices} detailed /> : <EmptyState loaded={loaded} title="No matching school geofences" detail="The API returned no school records matching this search." />}<p className="api-readonly-note">This API exposes school geofences as read-only records. Add create or edit endpoints to enable changes here.</p></section>;
}

function DevicesPage({ devices, loaded }: { devices: DeviceRecord[]; loaded: boolean }) {
  return <section className="panel page-panel"><PanelHeader title="Device management" subtitle="Devices returned by the admin API" />{devices.length ? <div className="table-scroll"><table><thead><tr><th>DEVICE</th><th>TYPE</th><th>ASSIGNED SCHOOL</th><th>STATUS</th><th>LAST SEEN</th></tr></thead><tbody>{devices.map(device => <tr key={device.id}><td><b>{device.name || device.id}</b></td><td>{device.deviceType || '—'}</td><td>{device.schoolId || '—'}</td><td><span className={`presence-pill ${device.status?.toUpperCase() === 'ACTIVE' ? 'present' : ''}`}>{device.status || 'Unknown'}</span></td><td>{dateTime(device.lastSeen)}</td></tr>)}</tbody></table></div> : <EmptyState loaded={loaded} title="No device inventory in API response" detail="The current admin response has no devices collection. School records also have null deviceId values, so the portal has no real devices to list." />}<p className="api-readonly-note">Device management requires a device inventory endpoint with device ID, assignment, status, and last-seen fields.</p></section>;
}

function EventsPage({ events, query, setQuery, eventType, setEventType, onExport, loaded, total }: { events: GeofenceEvent[]; query: string; setQuery: (value: string) => void; eventType: string; setEventType: (value: string) => void; onExport: () => void; loaded: boolean; total?: number }) {
  return <section className="panel page-panel"><PanelHeader title="Geofence entry and exit events" subtitle={`${events.length} loaded${total != null ? ` of ${total} total` : ''}`} action="Export CSV" onAction={onExport} /><div className="table-controls"><SearchInput value={query} onChange={setQuery} placeholder="Search school or event ID" /><select value={eventType} onChange={event => setEventType(event.target.value)}><option>All events</option><option>Enter</option><option>Exit</option></select></div>{events.length ? <EventsTable events={events} /> : <EmptyState loaded={loaded} title="No geofence events" detail="No entry or exit events were returned for this filter." />}</section>;
}

function LocationsPage({ locations, query, setQuery, fromDate, toDate, setFromDate, setToDate, onExport, loaded, total }: { locations: LocationRecord[]; query: string; setQuery: (value: string) => void; fromDate: string; toDate: string; setFromDate: (value: string) => void; setToDate: (value: string) => void; onExport: () => void; loaded: boolean; total?: number }) {
  return <section className="panel page-panel"><PanelHeader title="Location history" subtitle={`${locations.length} loaded${total != null ? ` of ${total} total` : ''}`} action="Export CSV" onAction={onExport} /><div className="table-controls"><SearchInput value={query} onChange={setQuery} placeholder="Search coordinates or device ID" /><DateRange fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} /></div>{locations.length ? <div className="table-scroll"><table><thead><tr><th>DEVICE</th><th>COORDINATES</th><th>ACCURACY</th><th>HEADING</th><th>TIME</th><th>SERVER RECEIVED</th></tr></thead><tbody>{locations.map((item, i) => <tr key={`${item.timestamp}-${i}`}><td>{item.deviceId || '—'}</td><td className="coordinates">{coordinate(item.latitude, item.longitude)}</td><td>{item.accuracy ?? item.accuracyMeters ?? '—'} m</td><td>{item.heading ?? '—'}</td><td>{dateTime(item.timestamp)}</td><td>{dateTime(item.receivedAt)}</td></tr>)}</tbody></table></div> : <EmptyState loaded={loaded} title="No location history" detail="The API returned no location records for this filter." />}</section>;
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
