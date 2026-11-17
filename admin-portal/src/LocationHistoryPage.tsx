import React, { useEffect, useState } from 'react';
import { downloadCsv, fetchLocationHistory } from './api';
import type { LocationRecord, SchoolGeofence } from './api';

const PAGE_SIZE = 100;
const format = (value?: string) => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleString() : '—';

export function LocationHistoryPage({ schools }: { schools: SchoolGeofence[] }) {
  const [records, setRecords] = useState<LocationRecord[]>([]);
  const [schoolId, setSchoolId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const result = await fetchLocationHistory({ schoolId: schoolId || undefined, deviceId: deviceId.trim() || undefined, startDate: fromDate || undefined, endDate: toDate || undefined, page, limit: PAGE_SIZE });
      setRecords(result.records);
      setTotal(result.pagination.total ?? result.records.length);
      setTotalPages(result.pagination.totalPages ?? 0);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load location history.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [schoolId, deviceId, fromDate, toDate, page]);

  function exportPage() {
    downloadCsv('location-history.csv', [
      ['Device ID', 'School', 'Latitude', 'Longitude', 'GPS accuracy (m)', 'Recorded at', 'Received at'],
      ...records.map(item => [item.deviceId, item.schoolName || item.schoolId, item.latitude, item.longitude, item.accuracy, item.timestamp, item.receivedAt]),
    ]);
  }

  return <section className="panel page-panel">
    <div className="panel-header"><div><h2>Location history</h2><p>{records.length} shown · {total} matching GPS samples</p></div><button className="button secondary" disabled={!records.length} onClick={exportPage}>Export current page CSV</button></div>
    {error && <div className="error-banner"><span>⚠</span><div><b>Location history request failed</b><small>{error}</small></div><button onClick={() => void load()}>Retry</button></div>}
    <div className="table-controls"><select value={schoolId} onChange={event => { setSchoolId(event.target.value); setPage(1); }}><option value="">All schools</option>{schools.map(school => <option key={school.id} value={school.id}>{school.name || school.id}</option>)}</select><input value={deviceId} onChange={event => { setDeviceId(event.target.value); setPage(1); }} placeholder="Device ID" /><label>From <input type="date" value={fromDate} onChange={event => { setFromDate(event.target.value); setPage(1); }} /></label><label>To <input type="date" value={toDate} onChange={event => { setToDate(event.target.value); setPage(1); }} /></label></div>
    {loading ? <div className="empty-state"><div className="spinner"/><b>Loading location history</b><span>Applying filters on the server.</span></div> : records.length ? <div className="table-scroll"><table><thead><tr><th>DEVICE</th><th>SCHOOL</th><th>COORDINATES</th><th>ACCURACY</th><th>RECORDED</th><th>RECEIVED</th></tr></thead><tbody>{records.map(item => <tr key={item.id}><td>{item.deviceName || item.deviceId || '—'}</td><td>{item.schoolName || item.schoolId || 'Outside a geofence'}</td><td>{item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}</td><td>{item.accuracy ?? '—'} m</td><td>{format(item.timestamp)}</td><td>{format(item.receivedAt)}</td></tr>)}</tbody></table></div> : <div className="empty-state"><b>No location samples found</b><span>Try changing or clearing the current filters.</span></div>}
    <div className="school-pagination"><small>{records.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, total)} of {total}</small><div><button disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} of {Math.max(totalPages, 1)}</span><button disabled={page >= totalPages || loading} onClick={() => setPage(value => value + 1)}>Next</button></div></div>
  </section>;
}
