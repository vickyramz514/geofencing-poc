import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';
const icons = {
  grid: '▦', pin: '⌖', route: '↗', activity: '⌁', users: '♙', settings: '⚙',
  search: '⌕', bell: '♧', arrow: '↗', clock: '◷', check: '✓', refresh: '⟳',
};
const dateTime = value => value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const timeAgo = value => {
  if (!value) return 'No activity yet';
  const mins = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  return mins < 1 ? 'Just now' : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;
};
const coordinate = (a, b) => `${Number(a).toFixed(5)}, ${Number(b).toFixed(5)}`;

function App() {
  const [data, setData] = useState({ locations: [], events: [], deliveries: [], office: null, presence: 'UNKNOWN' });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [lastSync, setLastSync] = useState(null);
  const [section, setSection] = useState('Overview');
  const [query, setQuery] = useState('');
  const [eventFilter, setEventFilter] = useState('All events');

  async function loadData() {
    try {
      const response = await fetch(`${API_URL}/api/admin/data`);
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      const next = await response.json();
      setData({ locations: [], events: [], deliveries: [], ...next });
      setLastSync(new Date()); setError('');
    } catch (e) {
      setError(`Can't reach the tracking API at ${API_URL}. Start the API server and refresh.`);
    } finally { setLoaded(true); }
  }
  useEffect(() => { loadData(); const id = setInterval(loadData, 15000); return () => clearInterval(id); }, []);

  const latest = data.locations.at(-1);
  const todayEvents = data.events.filter(e => new Date(e.eventTime).toDateString() === new Date().toDateString());
  const activeSchools = new Set(data.events.map(e => e.schoolId)).size;
  const filteredEvents = useMemo(() => data.events.filter(e => {
    const text = `${e.schoolId} ${e.eventType} ${e.eventId}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (eventFilter === 'All events' || e.eventType === eventFilter.toUpperCase());
  }).slice().reverse(), [data.events, query, eventFilter]);
  const recentLocations = data.locations.slice().reverse().slice(0, 8);

  const nav = [
    ['Overview', icons.grid], ['Live map', icons.pin], ['Geofence events', icons.activity], ['Deliveries', icons.route],
  ];
  const exportEvents = () => {
    const rows = [['Event ID', 'School ID', 'Type', 'Latitude', 'Longitude', 'Accuracy', 'Event time', 'Received at'], ...filteredEvents.map(e => [e.eventId, e.schoolId, e.eventType, e.latitude, e.longitude, e.accuracy, e.eventTime, e.receivedAt])];
    const csv = rows.map(row => row.map(v => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'geofence-events.csv'; a.click(); URL.revokeObjectURL(a.href);
  };

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">f</span><span>fieldtrace<span className="brand-dot">.</span></span></div>
      <div className="workspace-label">WORKSPACE</div>
      <div className="workspace"><div className="workspace-icon">N</div><div><b>Northstar Logistics</b><small>Operations team</small></div><span className="chevron">⌄</span></div>
      <div className="nav-label">MONITORING</div>
      <nav>{nav.map(([name, icon]) => <button key={name} className={`nav-item ${section === name ? 'selected' : ''}`} onClick={() => setSection(name)}><span className="nav-icon">{icon}</span>{name}{name === 'Geofence events' && <span className="nav-count">{data.events.length}</span>}</button>)}</nav>
      <div className="nav-label tools-label">MANAGE</div>
      <button className="nav-item" onClick={() => setSection('Team')}><span className="nav-icon">{icons.users}</span>Team</button>
      <button className="nav-item" onClick={() => setSection('Settings')}><span className="nav-icon">{icons.settings}</span>Settings</button>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon">?</div><b>Need a hand?</b><p>Visit the help center for setup and troubleshooting.</p><button onClick={() => window.open('https://example.com', '_blank')}>Open help center <span>↗</span></button></div><div className="profile"><div className="avatar">JD</div><div><b>Jordan Davis</b><small>Administrator</small></div><span className="more">···</span></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="crumb">Operations <span>/</span> <b>{section}</b></div><div className="top-actions"><div className="api-indicator"><i className={error ? 'offline' : ''}></i>{error ? 'API disconnected' : 'API connected'}</div><button className="icon-button" aria-label="Notifications">{icons.bell}<span className="notification-dot" /></button><div className="top-avatar">JD</div></div></header>
      <div className="content">
        {error && <div className="error-banner"><span>⚠</span><div><b>Data connection unavailable</b><small>{error}</small></div><button onClick={loadData}>Retry</button></div>}
        <div className="page-heading"><div><div className="eyebrow">{new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}</div><h1>{section === 'Overview' ? 'Good morning, Jordan' : section}</h1><p>{section === 'Overview' ? 'Here’s what’s happening across your geofenced operations today.' : `Review ${section.toLowerCase()} across your geofenced operations.`}</p></div><div className="heading-actions"><div className="sync-status"><span className="sync-dot"></span>Updated {timeAgo(lastSync)}</div><button className="button secondary" onClick={loadData}><span className="refresh">{icons.refresh}</span> Refresh</button><button className="button primary" onClick={exportEvents}><span>↓</span> Export report</button></div></div>
        <div className="stat-grid">
          <Stat title="Location updates" value={data.locations.length} note={`${latest ? timeAgo(latest.timestamp) : 'Waiting for first GPS fix'}`} icon="⌖" tone="blue" badge="ALL TIME" />
          <Stat title="Geofence events" value={data.events.length} note={`${todayEvents.length} recorded today`} icon="◎" tone="violet" badge="TODAY" />
          <Stat title="Schools monitored" value={activeSchools || '—'} note="Unique locations with activity" icon="⌂" tone="amber" badge="ACTIVE" />
          <Stat title="Office presence" value={data.office ? data.presence : 'Not set'} note={data.office ? `${data.office.radiusMeters}m radius` : 'Starts with mobile tracking'} icon="◉" tone="green" badge={data.office ? 'LIVE' : 'WAITING'} />
        </div>
        <div className="dashboard-grid">
          <section className="panel map-panel"><div className="panel-header"><div><h2>Live tracking</h2><p>Most recent device location</p></div><button className="small-select" onClick={() => setSection('Live map')}>View map <span>↗</span></button></div><TrackingMap location={latest} office={data.office} locations={data.locations} /><div className="map-legend"><span><i className="legend-blue" />Latest location</span><span><i className="legend-ring" />Office geofence</span><span className="map-coord">{latest ? coordinate(latest.latitude, latest.longitude) : 'Waiting for location data'}</span></div></section>
          <section className="panel activity-panel"><div className="panel-header"><div><h2>Geofence activity</h2><p>Events recorded today</p></div><button className="dots">···</button></div><ActivityChart events={todayEvents} /><div className="activity-summary"><span className="activity-key"><i className="enter-key" />Entries</span><b>{todayEvents.filter(e => e.eventType === 'ENTER').length}</b><span className="activity-key"><i className="exit-key" />Exits</span><b>{todayEvents.filter(e => e.eventType === 'EXIT').length}</b></div></section>
        </div>
        <section className="panel events-panel"><div className="panel-header events-heading"><div><h2>{section === 'Geofence events' ? 'All geofence events' : 'Recent geofence events'}</h2><p>Entry and exit activity from monitored locations</p></div><button className="text-link" onClick={exportEvents}>Export CSV <span>↓</span></button></div><div className="table-controls"><label className="search"><span>{icons.search}</span><input placeholder="Search school or event ID" value={query} onChange={e => setQuery(e.target.value)} /></label><select value={eventFilter} onChange={e => setEventFilter(e.target.value)}><option>All events</option><option>Enter</option><option>Exit</option></select><button className="filter-button" onClick={exportEvents}>↓ <span>Export</span></button></div><EventsTable events={section === 'Geofence events' ? filteredEvents : filteredEvents.slice(0, 6)} />{filteredEvents.length === 0 && <EmptyState loaded={loaded} title="No geofence events yet" detail="Events will appear here when a tracked device enters or leaves a configured geofence." />}</section>
        <div className="lower-grid"><section className="panel locations-panel"><div className="panel-header"><div><h2>Latest location updates</h2><p>Device GPS history</p></div><button className="text-link" onClick={() => setSection('Live map')}>View all <span>→</span></button></div>{recentLocations.length ? <div className="location-list">{recentLocations.slice(0, section === 'Live map' ? 8 : 4).map((loc, i) => <div className="location-row" key={`${loc.timestamp}-${i}`}><span className="location-pin">⌖</span><div className="location-info"><b>{coordinate(loc.latitude, loc.longitude)}</b><small>Accuracy ±{loc.accuracy ?? '—'}m</small></div><span className="location-time">{timeAgo(loc.timestamp)}</span></div>)}</div> : <EmptyState loaded={loaded} title="No location updates" detail="GPS updates will appear when tracking is active." />}</section><section className="panel delivery-panel"><div className="panel-header"><div><h2>Delivery status</h2><p>Latest workflow updates</p></div><button className="text-link" onClick={() => setSection('Deliveries')}>View all <span>→</span></button></div>{data.deliveries.length ? <div className="delivery-list">{data.deliveries.slice().reverse().slice(0, section === 'Deliveries' ? 50 : 4).map((item, i) => <div className="delivery-row" key={`${item.deliveryId}-${item.receivedAt}-${i}`}><span className="delivery-icon">✓</span><div className="delivery-info"><b>{item.schoolId}</b><small>Delivery {item.deliveryId}</small></div><span className="status-pill">{item.status.replaceAll('_', ' ')}</span></div>)}</div> : <EmptyState loaded={loaded} title="No delivery updates" detail="Delivery status changes will appear here." />}</section></div>
        <footer><span>Fieldtrace Operations</span><span>Auto-refreshing every 15 seconds <i className="live-dot" /></span><span>Last sync {lastSync ? dateTime(lastSync) : '—'}</span></footer>
      </div>
    </main>
  </div>;
}

function Stat({ title, value, note, icon, tone, badge }) { return <section className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><span className={`stat-badge ${tone}`}>{badge}</span><div className="stat-title">{title}</div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></section>; }

function TrackingMap({ location, office, locations }) {
  const points = locations.slice(-20);
  return <div className="map-canvas"><div className="map-grid" /><div className="map-road road-one" /><div className="map-road road-two" /><div className="map-road road-three" /><div className="map-river" /><span className="map-label label-a">CENTRAL DISTRICT</span><span className="map-label label-b">RIVER PARK</span><span className="map-label label-c">NORTH AVENUE</span>{office && <div className="office-circle" title={`Office geofence · ${office.radiusMeters}m`}><span /></div>}{points.length > 1 && <svg className="track-line" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={points.map((_, i) => `${12 + (i * 71 / Math.max(1, points.length - 1))},${66 - Math.sin(i * 0.7) * 24}`).join(' ')} /></svg>}<div className="vehicle-marker"><span>⌖</span></div><div className="map-zoom"><button>+</button><button>−</button></div><div className="map-attribution">Map preview · coordinates from device GPS</div></div>;
}

function ActivityChart({ events }) {
  const counts = Array.from({ length: 12 }, (_, i) => ({ hour: i * 2, enter: 0, exit: 0 }));
  events.forEach(e => { const hour = new Date(e.eventTime).getHours(); const bucket = counts[Math.floor(hour / 2)]; if (bucket) bucket[e.eventType.toLowerCase()] += 1; });
  const max = Math.max(3, ...counts.map(c => c.enter + c.exit));
  return <div className="chart-wrap"><div className="chart-y"><span>{max}</span><span>{Math.ceil(max / 2)}</span><span>0</span></div><div className="chart"><div className="chart-gridline one"/><div className="chart-gridline two"/><div className="chart-gridline three"/><div className="bars">{counts.map(c => <div className="bar-group" key={c.hour}><div className="bar-pair"><i className="bar-enter" style={{ height: `${Math.max(c.enter ? 8 : 2, c.enter / max * 100)}%` }} /><i className="bar-exit" style={{ height: `${Math.max(c.exit ? 8 : 2, c.exit / max * 100)}%` }} /></div><span>{String(c.hour).padStart(2, '0')}</span></div>)}</div></div></div>;
}

function EventsTable({ events }) { return <div className="table-scroll"><table><thead><tr><th>EVENT</th><th>LOCATION</th><th>TYPE</th><th>COORDINATES</th><th>ACCURACY</th><th>TIME</th></tr></thead><tbody>{events.map((e, i) => <tr key={e.eventId || i}><td><span className="event-id">{e.eventId || '—'}</span></td><td><span className="school-avatar">⌂</span><b>{e.schoolId}</b></td><td><span className={`event-pill ${e.eventType === 'ENTER' ? 'enter' : 'exit'}`}><i />{e.eventType}</span></td><td className="coordinates">{coordinate(e.latitude, e.longitude)}</td><td>{e.accuracy == null ? '—' : `±${e.accuracy}m`}</td><td className="event-time">{dateTime(e.eventTime)}</td></tr>)}</tbody></table></div>; }

function EmptyState({ loaded, title, detail }) { return <div className="empty-state"><div className="empty-icon">⌖</div><b>{loaded ? title : 'Loading activity…'}</b><span>{loaded ? detail : 'Connecting to your tracking API.'}</span></div>; }

createRoot(document.getElementById('root')).render(<App />);
