import React, { useEffect, useState } from 'react';
import { exportGeofenceEvents, fetchGeofenceEvents } from './api';
import type { GeofenceEvent, SchoolGeofence } from './api';

const PAGE_SIZE = 20;
const toIso = (day: string, end = false) => day ? new Date(`${day}T${end ? '23:59:59.999' : '00:00:00.000'}Z`).toISOString() : undefined;
const format = (value?: string) => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleString() : '—';

export function GeofenceEventsPage({ schools }: { schools: SchoolGeofence[] }) {
  const [events, setEvents] = useState<GeofenceEvent[]>([]);
  const [schoolId, setSchoolId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [eventType, setEventType] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const result = await fetchGeofenceEvents({
        schoolId: schoolId || undefined,
        deviceId: deviceId.trim() || undefined,
        eventType: (eventType || undefined) as 'ENTER' | 'EXIT' | undefined,
        from: toIso(fromDate),
        to: toIso(toDate, true),
        page,
        limit: PAGE_SIZE,
      });
      setEvents(result.records);
      setTotal(result.pagination.total ?? result.records.length);
      setTotalPages(result.pagination.totalPages ?? 0);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load geofence events.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [schoolId, deviceId, eventType, fromDate, toDate, page]);

  async function exportCsv() {
    setExporting(true);
    setError('');
    try {
      await exportGeofenceEvents({
        schoolId: schoolId || undefined,
        deviceId: deviceId.trim() || undefined,
        eventType: (eventType || undefined) as 'ENTER' | 'EXIT' | undefined,
        from: toIso(fromDate),
        to: toIso(toDate, true),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not export geofence events.');
    } finally {
      setExporting(false);
    }
  }

  return <section className="panel page-panel">
    <div className="panel-header"><div><h2>Geofence entry and exit events</h2><p>{total} matching events · newest first</p></div><button className="button secondary" disabled={exporting} onClick={() => void exportCsv()}>{exporting ? 'Exporting…' : 'Export CSV'}</button></div>
    {error && <div className="error-banner"><span>⚠</span><div><b>Geofence event request failed</b><small>{error}</small></div><button onClick={() => void load()}>Retry</button></div>}
    <div className="table-controls"><select value={schoolId} onChange={event => { setSchoolId(event.target.value); setPage(1); }}><option value="">All geofences</option>{schools.map(school => <option key={school.id} value={school.id}>{school.name || school.id}</option>)}</select><input value={deviceId} onChange={event => { setDeviceId(event.target.value); setPage(1); }} placeholder="Truck ID" /><select value={eventType} onChange={event => { setEventType(event.target.value); setPage(1); }}><option value="">All event types</option><option value="ENTER">ENTER</option><option value="EXIT">EXIT</option></select><label>From <input type="date" value={fromDate} onChange={event => { setFromDate(event.target.value); setPage(1); }} /></label><label>To <input type="date" value={toDate} onChange={event => { setToDate(event.target.value); setPage(1); }} /></label></div>
    {loading ? <div className="empty-state"><div className="spinner"/><b>Loading geofence events</b><span>Applying filters on the server.</span></div> : events.length ? <div className="table-scroll"><table><thead><tr><th>EVENT</th><th>GEOFENCE</th><th>TRUCK</th><th>TYPE</th><th>COORDINATES</th><th>ACCURACY</th><th>EVENT TIME</th><th>RECEIVED</th></tr></thead><tbody>{events.map(event => <tr key={event.eventId}><td>{event.eventId}</td><td>{event.schoolName || event.schoolId}</td><td>{event.deviceId || '—'}</td><td>{event.eventType}</td><td>{event.latitude.toFixed(5)}, {event.longitude.toFixed(5)}</td><td>{event.accuracy ?? '—'} m</td><td>{format(event.eventTime)}</td><td>{format(event.receivedAt)}</td></tr>)}</tbody></table></div> : <div className="empty-state"><b>No geofence events found</b><span>Try changing or clearing the current filters.</span></div>}
    <div className="school-pagination"><small>{events.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, total)} of {total}</small><div><button disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} of {Math.max(totalPages, 1)}</span><button disabled={page >= totalPages || loading} onClick={() => setPage(value => value + 1)}>Next</button></div></div>
  </section>;
}
