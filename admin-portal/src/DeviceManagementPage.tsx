import React, { useEffect, useState } from 'react';
import { createDevice, fetchDevices, fetchSchools, setDeviceActive, updateDevice } from './api';
import type { DeviceRecord, SchoolGeofence } from './api';

const PAGE_SIZE = 20;

export function DeviceManagementPage() {
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [schools, setSchools] = useState<SchoolGeofence[]>([]);
  const [page, setPage] = useState(1);
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [platform, setPlatform] = useState<'android' | 'ios'>('android');
  const [appVersion, setAppVersion] = useState('');
  const [schoolIds, setSchoolIds] = useState<string[]>([]);
  const [editingAssignments, setEditingAssignments] = useState<string | null>(null);
  const [assignmentDraft, setAssignmentDraft] = useState<string[]>([]);

  async function load() {
    setLoading(true);
    try {
      const [result, schoolResult] = await Promise.all([
        fetchDevices({ page, limit: PAGE_SIZE, active: activeFilter === 'all' ? undefined : activeFilter === 'active', search: search || undefined }),
        fetchSchools({ page: 1, limit: 100, active: true }),
      ]);
      setDevices(result.records);
      setTotal(result.pagination.total ?? result.records.length);
      setSchools(schoolResult.records);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load devices.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [page, activeFilter, search]);

  async function submitCreate(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await createDevice({ deviceId: deviceId.trim(), platform, ...(appVersion.trim() ? { appVersion: appVersion.trim() } : {}), schoolIds });
      setDeviceId('');
      setAppVersion('');
      setSchoolIds([]);
      setShowCreate(false);
      setNotice('Device registered.');
      setPage(1);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not register the device.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(device: DeviceRecord) {
    setSaving(true);
    setError('');
    try {
      await setDeviceActive(device.deviceId, !device.active);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update device status.');
    } finally {
      setSaving(false);
    }
  }

  async function saveAssignments(device: DeviceRecord) {
    setSaving(true);
    setError('');
    try {
      await updateDevice(device.deviceId, { schoolIds: assignmentDraft });
      setEditingAssignments(null);
      setNotice(`School assignments updated for ${device.deviceId}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update school assignments.');
    } finally {
      setSaving(false);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return <section className="panel page-panel">
    <div className="panel-header"><div><h2>Device management</h2><p>{total} registered device{total === 1 ? '' : 's'} · live status, GPS, and school assignments</p></div><button className="button primary" onClick={() => setShowCreate(value => !value)}>{showCreate ? 'Cancel' : '＋ Register device'}</button></div>
    {notice && <div className="school-notice"><span>✓</span>{notice}<button onClick={() => setNotice('')}>×</button></div>}
    {error && <div className="error-banner"><span>⚠</span><div><b>Device API request failed</b><small>{error}</small></div><button onClick={() => void load()}>Retry</button></div>}
    {showCreate && <form className="device-create-form" onSubmit={event => void submitCreate(event)}>
      <label>Device ID<input required minLength={8} maxLength={128} value={deviceId} onChange={event => setDeviceId(event.target.value)} placeholder="device-identifier" /></label>
      <label>Platform<select value={platform} onChange={event => setPlatform(event.target.value as 'android' | 'ios')}><option value="android">Android</option><option value="ios">iOS</option></select></label>
      <label>App version<input value={appVersion} onChange={event => setAppVersion(event.target.value)} placeholder="1.0.0" /></label>
      <label>Schools<select multiple value={schoolIds} onChange={event => setSchoolIds(Array.from(event.currentTarget.selectedOptions, option => option.value))}>{schools.map(school => <option key={school.id} value={school.id}>{school.name || school.id}</option>)}</select></label>
      <button className="button primary" disabled={saving}>{saving ? 'Registering…' : 'Register device'}</button>
    </form>}
    <div className="table-controls"><label className="search"><span>⌕</span><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Search device ID" /></label><select value={activeFilter} onChange={event => { setActiveFilter(event.target.value); setPage(1); }}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
    {loading ? <div className="empty-state"><div className="spinner"/><b>Loading devices</b><span>Fetching the admin device inventory.</span></div> : devices.length ? <div className="table-scroll"><table><thead><tr><th>DEVICE</th><th>PLATFORM</th><th>SCHOOLS</th><th>GEOFENCE</th><th>LATEST GPS</th><th>LAST SEEN</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>{devices.map(device => {
      const assigned = device.schools?.map(item => item.school.id) ?? [];
      const location = device.latestGpsLocation;
      const status = device.geofencePresence?.status ?? 'UNKNOWN';
      return <tr key={device.deviceId}><td><b>{device.deviceId}</b><small>{device.appVersion || 'App version unavailable'}</small></td><td>{device.platform}</td><td>{editingAssignments === device.deviceId
        ? <><select multiple value={assignmentDraft} onChange={event => setAssignmentDraft(Array.from(event.currentTarget.selectedOptions, option => option.value))}>{schools.map(school => <option key={school.id} value={school.id}>{school.name || school.id}</option>)}</select><button className="table-action" disabled={saving} onClick={() => void saveAssignments(device)}>Save</button></>
        : <><span>{device.schools?.map(item => item.school.name).join(', ') || 'Unassigned'}</span><button className="table-action" onClick={() => { setEditingAssignments(device.deviceId); setAssignmentDraft(assigned); }}>Edit</button></>}</td><td><span className={`presence-pill ${status === 'INSIDE' ? 'present' : ''}`}>{status}{device.geofencePresence?.school?.name ? ` · ${device.geofencePresence.school.name}` : ''}</span></td><td>{location ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)} · ±${location.accuracy} m` : 'No GPS fix'}</td><td>{device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : '—'}</td><td><span className={`presence-pill ${device.active ? 'present' : ''}`}>{device.status}</span></td><td><button className="table-action" disabled={saving} onClick={() => void toggleStatus(device)}>{device.active ? 'Deactivate' : 'Activate'}</button></td></tr>;
    })}</tbody></table></div> : <div className="empty-state"><b>No devices found</b><span>Register a mobile device or adjust the filters.</span></div>}
    <div className="school-pagination"><small>{devices.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, total)} of {total}</small><div><button disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} of {Math.max(totalPages, 1)}</span><button disabled={page >= totalPages || loading} onClick={() => setPage(value => value + 1)}>Next</button></div></div>
  </section>;
}
