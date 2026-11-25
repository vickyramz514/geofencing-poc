import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import L, { type LatLngExpression } from 'leaflet';
import { Circle, CircleMarker, MapContainer, Marker, Polygon, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import { adminDataUrl, downloadCsv, fetchAdminData } from './api';
import type { AdminData, GeofenceEvent, LocationRecord, SchoolGeofence } from './api';
import { LiveLocationMap } from './LiveLocationMap';
import { DeviceManagementPage } from './DeviceManagementPage';
import { GeofenceEventsPage as ApiGeofenceEventsPage } from './GeofenceEventsPage';
import { LocationHistoryPage as ApiLocationHistoryPage } from './LocationHistoryPage';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import './fleet.css';

const SchoolGeofencesManager = lazy(() => import('./SchoolGeofencesManager').then(module => ({ default: module.SchoolGeofencesManager })));

type Section = 'Overview' | 'Live truck map' | 'Geofences' | 'Trucks' | 'Geofence events' | 'Location history' | 'Deliveries' | 'Reports';
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
  ['Overview', '⌂'], ['Live truck map', '⌖'], ['Trucks', '♧'], ['Geofences', '◎'],
  ['Location history', '◷'], ['Geofence events', '♧'], ['Reports', '▥'],
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
const mapIcon = (className: string, text: string) => L.divIcon({
  className: 'map-marker-shell', html: `<span class="${className}">${text}</span>`,
  iconSize: [26, 26], iconAnchor: [13, 13],
});
const latestIcon = mapIcon('latest-map-marker', '🚚');
const enterIcon = mapIcon('event-map-marker enter-map-marker', '↘');
const exitIcon = mapIcon('event-map-marker exit-map-marker', '↗');
function overviewDeviceIcon(name: string) {
  const replacements: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  };
  const safeName = name.replace(/[&<>"']/g, character => replacements[character] ?? character);
  return L.divIcon({
    className: 'map-marker-shell named-device-shell',
    html: `<span class="latest-map-marker">🚚</span><span class="overview-device-label" title="${safeName}">${safeName}</span>`,
    iconSize: [220, 30],
    iconAnchor: [13, 13],
  });
}
function overviewOfficeIcon(name: string) {
  const replacements: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  };
  const safeName = name.replace(/[&<>"']/g, character => replacements[character] ?? character);
  return L.divIcon({
    className: 'map-marker-shell overview-office-shell',
    html: `<span class="overview-office-pin">◎</span><span class="overview-office-label" title="${safeName}">${safeName}</span>`,
    iconSize: [240, 32],
    iconAnchor: [13, 13],
  });
}

function App() {
  const [data, setData] = useState<AdminData>(EMPTY_DATA);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [section, setSection] = useState<Section>('Overview');
  const [createGeofence, setCreateGeofence] = useState(false);
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const connected = !error && lastSync !== null;

  function openSection(next: Section) {
    setCreateGeofence(false);
    setSection(next);
  }

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
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    void refresh(controller.signal);
    const timer = window.setInterval(refreshWhenVisible, 60_000);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

  const locations = useMemo(() => data.locations.slice().sort((a, b) => timeValue(a.timestamp) - timeValue(b.timestamp)), [data.locations]);
  const events = useMemo(() => data.events.slice().sort((a, b) => timeValue(a.eventTime) - timeValue(b.eventTime)), [data.events]);
  const exportReport = () => {
    const reportRows: unknown[][] = [['Record type', 'ID', 'Name / geofence', 'Status / event', 'Latitude', 'Longitude', 'Time']];
    data.offices.forEach(item => reportRows.push(['Geofence', item.id, item.name, item.presence, item.latitude, item.longitude, item.presenceUpdatedAt]));
    locations.filter(item => inDateRange(item.timestamp, fromDate, toDate)).forEach(item => reportRows.push(['Location', item.deviceId, '', '', item.latitude, item.longitude, item.timestamp]));
    events.filter(item => inDateRange(item.eventTime, fromDate, toDate)).forEach(item => reportRows.push(['Geofence event', item.eventId, item.schoolName ?? item.schoolId, item.eventType, item.latitude, item.longitude, item.eventTime]));
    data.deliveries.filter(item => inDateRange(item.updatedAt ?? item.receivedAt, fromDate, toDate)).forEach(item => reportRows.push(['Delivery', item.deliveryId, item.schoolName ?? item.schoolId, item.status, '', '', item.updatedAt ?? item.receivedAt]));
    downloadCsv('geofencing-report.csv', reportRows);
  };

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark" aria-hidden="true">🚚</span><span>Truck<span className="brand-dot"> Tracking</span></span></div>
      <nav>{navItems.map(([name, icon]) => <button key={name} className={`nav-item ${section === name ? 'selected' : ''}`} aria-current={section === name ? 'page' : undefined} onClick={() => openSection(name)}><span className="nav-icon" aria-hidden="true">{icon}</span>{name === 'Geofence events' ? 'Alerts & Events' : name === 'Live truck map' ? 'Live Fleet Map' : name === 'Location history' ? 'Location History' : name}{name === 'Geofence events' && <span className="nav-count">{data.eventPage.total ?? data.events.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="tracking-summary"><span aria-hidden="true">⌖</span><b>GPS Fleet Tracking</b><small>Live locations and geofence events</small></div><div className="connection-card"><span className={connected ? 'connection-dot' : 'connection-dot offline'}></span><div><b>{connected ? 'API connected' : error ? 'API unavailable' : 'Connecting to API'}</b><small>{lastSync ? `Synced ${timeAgo(lastSync.toISOString())}` : 'Waiting for first sync'}</small></div></div></div>
    </aside>
    <main className="main">
      <header className="fleet-header">
        <div><h1>{section}</h1><p>{sectionDescription(section)}</p></div>
        <div className="fleet-header-actions">
          {section === 'Overview' && <SearchInput value={search} onChange={setSearch} placeholder="Search trucks or geofences…" />}
          <button className="fleet-icon-button" aria-label="Alerts and events" onClick={() => setSection('Geofence events')}>♧</button>
          <button className="fleet-icon-button" aria-label="Refresh dashboard" title="Refresh dashboard" onClick={() => void refresh()}>⟳</button>
          <div className="fleet-profile"><span aria-hidden="true">GA</span><div><b>Geofence Admin</b><small>Admin</small></div></div>
        </div>
      </header>
      <div className="content">
        {error && <div className="error-banner"><span>⚠</span><div><b>Data connection unavailable</b><small>{error}</small></div><button onClick={() => void refresh()}>Retry</button></div>}
        {section !== 'Overview' && !['Geofence events', 'Location history', 'Reports'].includes(section) && <div className="section-actions"><button className="button primary" onClick={exportReport}>↓ Export CSV</button></div>}
        {!loaded && !error ? <LoadingState /> : <>
          {section === 'Overview' && <Overview data={data} events={events} locations={locations} onOpen={openSection} onCreateGeofence={() => { setCreateGeofence(true); setSection('Geofences'); }} search={search} connected={connected} />}
          {section === 'Live truck map' && <LiveLocationMap />}
          {section === 'Geofences' && <Suspense fallback={<LoadingState />}><SchoolGeofencesManager startCreating={createGeofence} /></Suspense>}
          {section === 'Trucks' && <DeviceManagementPage />}
          {section === 'Geofence events' && <ApiGeofenceEventsPage schools={data.offices} />}
          {section === 'Location history' && <ApiLocationHistoryPage schools={data.offices} />}
          {section === 'Deliveries' && <DeliveriesPage deliveries={data.deliveries.slice().reverse()} loaded={loaded} total={data.deliveryPage.total} />}
          {section === 'Reports' && <ReportsPage data={data} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} onExport={exportReport} />}
        </>}
        <footer><span>Truck Tracking Admin</span><span>Auto-refreshes every minute <i className="live-dot" /></span><span>Last sync {lastSync ? dateTime(lastSync.toISOString()) : '—'}</span></footer>
      </div>
    </main>
  </div>;
}

function Overview({ data, events, locations, onOpen, onCreateGeofence, search, connected }: {
  data: AdminData; events: GeofenceEvent[]; locations: LocationRecord[];
  onOpen: (section: Section) => void; onCreateGeofence: () => void; search: string; connected: boolean;
}) {
  const metrics = data.dashboard.metrics;
  const [truckId, setTruckId] = useState('');
  const query = search.trim().toLowerCase();
  const matches = (...values: Array<string | null | undefined>) => values.some(value => value?.toLowerCase().includes(query));
  const latestByTruck = new Map<string, LocationRecord>();
  const newest = [...locations, ...data.dashboard.latestGpsLocations.records].sort((a, b) => timeValue(b.timestamp) - timeValue(a.timestamp));
  for (const fix of newest) {
    if (fix.deviceId && !latestByTruck.has(fix.deviceId)) latestByTruck.set(fix.deviceId, fix);
  }
  const trucks = [...latestByTruck.values()].filter(item => !query || matches(item.deviceId, item.deviceName, item.schoolName));
  const offices = data.offices.filter(item => !query || matches(item.id, item.name));
  const selectedTruck = truckId && trucks.some(item => item.deviceId === truckId) ? truckId : '';
  const truckIds = new Set(trucks.map(item => item.deviceId));
  const visibleLocations = locations.filter(item => selectedTruck ? item.deviceId === selectedTruck : !query || truckIds.has(item.deviceId));
  const matchingEvents = events.filter(item => !query || matches(item.deviceId, item.schoolId, item.schoolName) || truckIds.has(item.deviceId));
  const status = [
    { label: 'Active', value: metrics.activeDevices, color: '#13cf8a' },
    { label: 'Other registered trucks', value: Math.max(0, metrics.totalRegisteredDevices - metrics.activeDevices), color: '#789ac4' },
  ];
  const total = status.reduce((sum, item) => sum + item.value, 0);
  const activeShare = total ? status[0].value / total * 100 : 0;
  const routeTruck = selectedTruck || [...visibleLocations].reverse().find(item => item.deviceId && validCoordinates(item))?.deviceId;
  const route = routeTruck ? visibleLocations.filter(item => item.deviceId === routeTruck && validCoordinates(item)) : [];
  const routeStops = route.length > 2 ? [route[0], route[Math.floor(route.length / 2)], route[route.length - 1]] : route;
  const stats = [
    { label: 'Total Trucks', value: metrics.totalRegisteredDevices, icon: '▣', tone: 'blue' },
    { label: 'Active', value: metrics.activeDevices, icon: '▷', tone: 'green' },
    { label: 'Stale GPS', value: metrics.devicesWithStaleGps, icon: 'Ⅱ', tone: 'amber' },
    { label: 'Alerts Today', value: metrics.todaysEntryEvents + metrics.todaysExitEvents, icon: '⚠', tone: 'red' },
    { label: 'Geofences', value: metrics.totalConfiguredGeofences, icon: '⌖', tone: 'blue' },
  ];
  return <div className="fleet-overview">
    <div className="fleet-stats">{stats.map(item => <section className="fleet-stat" key={item.label}>
      <span className={`fleet-stat-icon ${item.tone}`} aria-hidden="true">{item.icon}</span>
      <div><strong>{item.value}</strong><span>{item.label}</span></div>
    </section>)}</div>
    <div className="fleet-primary-grid">
      <section className="panel fleet-map-panel">
        <div className="fleet-panel-heading">
          <div><h2>Live Fleet Map {connected && <span className="fleet-live">● Live</span>}</h2><p>Truck locations, geofences and route trails</p></div>
          <div className="fleet-map-actions"><select name="truckId" aria-label="Filter map by truck" value={selectedTruck} onChange={event => setTruckId(event.target.value)}>
            <option value="">All trucks</option>
            {trucks.map(item => <option key={item.deviceId} value={item.deviceId ?? ''}>{item.deviceName || item.deviceId}</option>)}
          </select><button className="fleet-icon-button" aria-label="Open live fleet map" onClick={() => onOpen('Live truck map')}>⛶</button></div>
        </div>
        <TrackingMap offices={offices} office={query ? null : data.office} locations={visibleLocations} deviceLocations={trucks.filter(item => !selectedTruck || item.deviceId === selectedTruck)} events={matchingEvents.filter(item => !selectedTruck || item.deviceId === selectedTruck)} latest={visibleLocations.at(-1)} />
        <MapLegend />
      </section>
      <div className="fleet-side-grid">
        <section className="panel fleet-status-panel">
          <PanelHeader title="Fleet Status" />
          <div className="fleet-status-body">
            <div className="fleet-donut" style={{ background: total ? `conic-gradient(#13cf8a 0 ${activeShare}%, #789ac4 ${activeShare}% 100%)` : '#26405b' }}>
              <div><strong>{metrics.totalRegisteredDevices}</strong><span>Trucks</span></div>
            </div>
            <ul>{status.map(item => <li key={item.label}><i style={{ background: item.color }} /><span>{item.label}</span><b>{item.value}</b></li>)}</ul>
          </div>
        </section>
        <section className="panel fleet-activity-panel"><PanelHeader title="Fleet Activity" subtitle="Geofence events · Last 24 hours" /><ActivityChart events={events} /></section>
      </div>
    </div>
    <div className="fleet-secondary-grid">
      <section className="panel">
        <PanelHeader title="Recent Trucks" action="View all" onAction={() => onOpen('Trucks')} />
        {trucks.length ? <div className="table-scroll fleet-truck-table"><table><thead><tr><th>Truck</th><th>Geofence</th><th>Last GPS</th><th>Map</th></tr></thead>
          <tbody>{trucks.slice(0, 5).map(item => <tr key={item.deviceId}><td><b>{item.deviceName || item.deviceId}</b></td><td>{item.schoolName || item.schoolId || '—'}</td><td>{timeAgo(item.timestamp)}</td><td><button className="text-link" aria-label={`Show ${item.deviceName || item.deviceId} on map`} onClick={() => setTruckId(item.deviceId || '')}>⌖</button></td></tr>)}</tbody>
        </table></div> : <EmptyState loaded title="No truck locations" detail="GPS updates will appear here when available." />}
      </section>
      <section className="panel">
        <PanelHeader title={`Geofences (${metrics.totalConfiguredGeofences})`} action="View all" onAction={() => onOpen('Geofences')} />
        {offices.length ? <OfficeList offices={offices.slice(0, 4)} /> : <EmptyState loaded title="No geofences to show" detail="Configured geofences appear here." />}
        <button className="button primary fleet-manage" onClick={onCreateGeofence}>＋ Create geofence</button>
      </section>
      <section className="panel">
        <PanelHeader title="Alerts & Events" action="View all" onAction={() => onOpen('Geofence events')} />
        {matchingEvents.length ? <ul className="fleet-event-list">{matchingEvents.slice(-4).reverse().map((event, index) => <li key={event.eventId || index}>
          <span className={`fleet-event-icon ${event.eventType === 'ENTER' ? 'enter' : 'exit'}`} aria-hidden="true">{event.eventType === 'ENTER' ? '↘' : '⚠'}</span>
          <div><b>{event.eventType === 'ENTER' ? 'Truck entered geofence' : event.eventType === 'EXIT' ? 'Truck exited geofence' : event.eventType || 'Geofence event'}</b><small>{event.schoolName || event.schoolId}{event.deviceId ? ` · ${latestByTruck.get(event.deviceId)?.deviceName || event.deviceId}` : ''}</small></div><time>{timeAgo(event.eventTime)}</time>
        </li>)}</ul> : <EmptyState loaded title="No geofence events to show" detail="Entry and exit events appear here." />}
      </section>
    </div>
    <section className="panel fleet-route-panel">
      <PanelHeader title="Route Activity" subtitle="Recent GPS checkpoints" action="Location history" onAction={() => onOpen('Location history')} />
      {routeStops.length > 1 ? <div className="fleet-route">
        <b>{latestByTruck.get(routeTruck || '')?.deviceName || routeTruck}</b>
        {routeStops.map((stop, index) => <div className="fleet-stop" key={index}><i>{String.fromCharCode(65 + index)}</i><div><b>{stop.schoolName || coordinate(stop.latitude, stop.longitude)}</b><small>{dateTime(stop.timestamp)}</small></div></div>)}
        <button className="button primary" onClick={() => onOpen('Live truck map')}>View live map</button>
      </div> : <p className="fleet-route-empty">A truck needs at least two GPS updates to show a route.</p>}
    </section>
  </div>;
}

function DeliveriesPage({ deliveries, loaded, total }: { deliveries: AdminData['deliveries']; loaded: boolean; total?: number }) {
  return <section className="panel page-panel"><PanelHeader title="Delivery status history" subtitle={`${deliveries.length} loaded${total != null ? ` of ${total} total` : ''}`} />{deliveries.length ? <div className="table-scroll"><table><thead><tr><th>GEOFENCE</th><th>DELIVERY</th><th>STATUS</th><th>UPDATED</th></tr></thead><tbody>{deliveries.map((item, i) => <tr key={`${item.deliveryId}-${i}`}><td>{item.schoolName || item.schoolId}</td><td>{item.deliveryId || '—'}</td><td><span className="status-pill">{item.status || '—'}</span></td><td>{dateTime(item.updatedAt || item.receivedAt)}</td></tr>)}</tbody></table></div> : <EmptyState loaded={loaded} title="No delivery updates" detail="The API returned no delivery status records." />}</section>;
}

function ReportsPage({ data, fromDate, toDate, setFromDate, setToDate, onExport }: { data: AdminData; fromDate: string; toDate: string; setFromDate: (value: string) => void; setToDate: (value: string) => void; onExport: () => void }) {
  const locationCount = data.locations.filter(item => inDateRange(item.timestamp, fromDate, toDate)).length;
  const eventCount = data.events.filter(item => inDateRange(item.eventTime, fromDate, toDate)).length;
  const deliveryCount = data.deliveries.filter(item => inDateRange(item.updatedAt || item.receivedAt, fromDate, toDate)).length;
  return <><section className="panel page-panel"><PanelHeader title="Reports" subtitle="Filter available API records by date and export a combined CSV" action="Download report" onAction={onExport} /><DateRange fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} /><div className="stat-grid report-stats"><Stat title="Location records" value={locationCount} note="In selected date range" icon="⌖" tone="blue" badge="DATA" /><Stat title="Geofence events" value={eventCount} note="In selected date range" icon="◎" tone="violet" badge="DATA" /><Stat title="Delivery updates" value={deliveryCount} note="In selected date range" icon="↗" tone="amber" badge="DATA" /><Stat title="Geofences" value={data.offices.length} note="Current configured total" icon="⌂" tone="green" badge="CURRENT" /></div><p className="api-readonly-note">The report includes records currently returned by the API. A response with pagination may contain only the current page; totals are shown in the relevant history views.</p></section></>;
}

function TrackingMap({ offices, office, locations, deviceLocations, events, latest }: { offices: SchoolGeofence[]; office: AdminData['office']; locations: LocationRecord[]; deviceLocations: LocationRecord[]; events: GeofenceEvent[]; latest?: LocationRecord }) {
  const gps = locations.filter(validCoordinates).slice(-250);
  const latestByDevice = new Map<string, LocationRecord>();
  [...locations, ...deviceLocations].filter(item => item.deviceId && validCoordinates(item)).forEach(item => {
    const id = item.deviceId!;
    const prior = latestByDevice.get(id);
    const itemTime = item.timestamp ? new Date(item.timestamp).getTime() : 0;
    const priorTime = prior?.timestamp ? new Date(prior.timestamp).getTime() : 0;
    if (!prior || itemTime >= priorTime) latestByDevice.set(id, item);
  });
  const currentDevices = [...latestByDevice.values()];
  const fences = offices.filter(validCoordinates);
  if (office && validCoordinates(office)) fences.push({ ...office, id: 'office', name: 'Geofence' });
  const eventPoints = events.filter(validCoordinates);
  const positions: LatLngExpression[] = [...gps, ...currentDevices, ...fences, ...eventPoints].map(point => [Number(point.latitude), Number(point.longitude)]);
  const anchor = latest && validCoordinates(latest) ? latest : fences[0] ?? gps[0] ?? currentDevices[0] ?? eventPoints[0] ?? { latitude: 13.0566, longitude: 80.2537 };
  const center: LatLngExpression = [Number(anchor.latitude), Number(anchor.longitude)];
  return <div className="map-canvas leaflet-canvas"><MapContainer center={center} zoom={14} scrollWheelZoom={false} className="leaflet-map">
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    <FitMapBounds positions={positions} />
    {fences.map((item, i) => {
      const polygons = polygonSets(item);
      const officeName = item.name || item.id;
      return <React.Fragment key={item.id || i}>{polygons.length ? polygons.map((polygon, polygonIndex) => <Polygon key={`${item.id}-polygon-${polygonIndex}`} positions={polygon} pathOptions={{ color: '#10caff', fillColor: '#02b6fd', fillOpacity: 0.24, weight: 3, dashArray: '7 5' }} />) : Number(item.radiusMeters) > 0 ? <Circle center={[Number(item.latitude), Number(item.longitude)]} radius={Number(item.radiusMeters)} pathOptions={{ color: '#10caff', fillColor: '#02b6fd', fillOpacity: 0.24, weight: 3 }} /> : null}<Marker position={[Number(item.latitude), Number(item.longitude)]} icon={overviewOfficeIcon(officeName)}><Popup><b>{officeName}</b><br />{polygons.length ? 'Polygon geofence' : `${item.radiusMeters} m radius`}<br />Presence: {item.presence || 'Unknown'}<br />Device: {item.deviceId || 'Not assigned'}</Popup></Marker></React.Fragment>;
    })}
    {Array.from(new Set(gps.map(item => item.deviceId).filter(Boolean))).map(id => {
      const trail = gps.filter(item => item.deviceId === id);
      return trail.length > 1 && <Polyline key={id} positions={trail.map(item => [Number(item.latitude), Number(item.longitude)] as LatLngExpression)} pathOptions={{ color: '#14bbff', weight: 3, opacity: 0.85 }} />;
    })}
    {gps.slice(0, -1).map((point, i) => <CircleMarker key={`gps-${point.timestamp}-${i}`} center={[Number(point.latitude), Number(point.longitude)]} radius={4} pathOptions={{ color: '#fff', weight: 1, fillColor: '#77a9cd', fillOpacity: 0.95 }}><Popup>GPS update<br />{coordinate(point.latitude, point.longitude)}<br />{dateTime(point.timestamp)}</Popup></CircleMarker>)}
    {currentDevices.map(item => {
      const label = item.deviceName || item.deviceId || 'Unknown truck';
      return <Marker key={`device-${item.deviceId}`} position={[Number(item.latitude), Number(item.longitude)]} icon={overviewDeviceIcon(label)}>
        <Popup><b>{label}</b><br />Truck ID: {item.deviceId}<br />{coordinate(item.latitude, item.longitude)}<br />Accuracy: ±{item.accuracy ?? item.accuracyMeters ?? '—'} m<br />{dateTime(item.timestamp)}<br />Status: {item.status || 'Unavailable'}</Popup>
      </Marker>;
    })}
    {!currentDevices.length && latest && validCoordinates(latest) && <Marker position={[Number(latest.latitude), Number(latest.longitude)]} icon={latestIcon}><Popup><b>Latest GPS fix</b><br />{coordinate(latest.latitude, latest.longitude)}<br />Accuracy: ±{latest.accuracy ?? latest.accuracyMeters ?? '—'} m<br />{dateTime(latest.timestamp)}</Popup></Marker>}
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

function MapLegend() { return <div className="map-legend"><span><i className="legend-blue" />Truck locations</span><span><i className="legend-ring" />Geofence boundary</span><span><i className="legend-enter" />ENTER</span><span><i className="legend-exit" />EXIT</span><span><i className="legend-blue" />Route trail</span></div>; }
function OfficeList({ offices, detailed = false }: { offices: SchoolGeofence[]; detailed?: boolean }) { return <div className="office-list">{offices.map(item => <div className="office-row" key={item.id}><span className="office-marker" aria-hidden="true">◎</span><div className="office-info"><b>{item.name || item.id}</b><small>{coordinate(item.latitude, item.longitude)} · {item.radiusMeters}m radius{item.deviceId ? ` · Device ${item.deviceId}` : ''}</small></div><span className={`presence-pill ${['PRESENT', 'INSIDE'].includes(String(item.presence).toUpperCase()) ? 'present' : ''}`}>{item.presence || 'UNKNOWN'}</span>{detailed && <span className="office-updated">{item.presenceUpdatedAt ? timeAgo(item.presenceUpdatedAt) : 'No presence update'}</span>}</div>)}</div>; }
function ActivityChart({ events }: { events: GeofenceEvent[] }) {
  const hour = 60 * 60 * 1000;
  const now = Date.now();
  const start = now - 24 * hour;
  const counts = Array<number>(12).fill(0);
  for (const event of events) {
    const time = timeValue(event.eventTime);
    if (time >= start && time <= now) counts[Math.min(11, Math.floor((time - start) / (2 * hour)))] += 1;
  }
  const max = Math.max(1, ...counts);
  const points = counts.map((value, index) => `${index * 30},${92 - value / max * 78}`).join(' ');
  return <div className="fleet-chart">
    <svg viewBox="0 0 330 96" preserveAspectRatio="none" role="img" aria-label={`Geofence events in two-hour intervals over the last 24 hours. Counts: ${counts.join(', ')}.`}>
      <defs><linearGradient id="activity-fill" x2="0%" y2="100%"><stop stopColor="#00b9ff" stopOpacity=".55" /><stop offset="1" stopColor="#00b9ff" stopOpacity=".04" /></linearGradient></defs>
      {[14, 40, 66, 92].map(y => <line key={y} x1="0" x2="330" y1={y} y2={y} stroke="#213854" />)}
      <polygon points={`0,92 ${points} 330,92`} fill="url(#activity-fill)" />
      <polyline points={points} fill="none" stroke="#16caff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
    <div><span>24h ago</span><span>12h ago</span><span>Now</span></div>
  </div>;
}
function Stat({ title, value, note, icon, tone, badge }: { title: string; value: string | number; note: string; icon: string; tone: string; badge: string }) { return <section className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><span className={`stat-badge ${tone}`}>{badge}</span><div className="stat-title">{title}</div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></section>; }
function PanelHeader({ title, subtitle, action, onAction }: { title: string; subtitle?: string; action?: string; onAction?: () => void }) { return <div className="panel-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action && <button className="text-link" onClick={onAction}>{action} <span>→</span></button>}</div>; }
function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) { return <label className="search"><span>⌕</span><input name="search" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} /></label>; }
function DateRange({ fromDate, toDate, setFromDate, setToDate }: { fromDate: string; toDate: string; setFromDate: (value: string) => void; setToDate: (value: string) => void }) { return <div className="date-range"><label>From <input name="fromDate" type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} /></label><label>To <input name="toDate" type="date" value={toDate} onChange={event => setToDate(event.target.value)} /></label></div>; }
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
function inDateRange(value: string | undefined, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!value || Number.isNaN(new Date(value).getTime())) return false;
  const time = new Date(value).getTime();
  return (!from || time >= new Date(`${from}T00:00:00`).getTime()) && (!to || time <= new Date(`${to}T23:59:59.999`).getTime());
}
function sectionDescription(section: Section): string {
  const copy: Record<Section, string> = {
    Overview: 'Real-time fleet, geofence and route intelligence',
    'Live truck map': 'View truck locations, GPS trails, and geofence boundaries.',
    'Geofences': 'Manage geofence boundaries and truck assignments.',
    Trucks: 'Manage registered trucks and their geofence assignments.',
    'Geofence events': 'Search and export entry and exit events reported by the mobile application.',
    'Location history': 'Browse GPS updates with timestamps, accuracy, and coordinates.',
    Deliveries: 'Review delivery status updates reported by the application.',
    Reports: 'Filter available records by date and export an operations report.',
  };
  return copy[section];
}

createRoot(document.getElementById('root')!).render(<App />);
