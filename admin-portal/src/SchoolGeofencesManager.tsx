import React, { useEffect, useMemo, useState } from 'react';
import L, { type LatLngExpression } from 'leaflet';
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';
import { createSchool, deleteOffice, fetchSchool, fetchSchools, updateSchool } from './api';
import type { SchoolGeofence, SchoolGeofenceInput } from './api';

const PAGE_LIMIT = 10;
type Geometry = { type: 'Polygon'; coordinates: number[][][] } | null;
interface FormState {
  name: string;
  latitude: string;
  longitude: string;
  radiusMeters: string;
  enabled: boolean;
  geofenceType: 'CIRCLE' | 'POLYGON';
  geometry: Geometry;
  assignedDevices: string[];
}
const blankForm = (): FormState => ({ name: 'Colaninfo Tech', latitude: '13.067930644538661', longitude: '80.25592817406542', radiusMeters: '200', enabled: true, geofenceType: 'CIRCLE', geometry: null, assignedDevices: [] });
const formatCoordinate = (value: number) => Number(value).toFixed(6);

export function SchoolGeofencesManager({ startCreating = false }: { startCreating?: boolean }) {
  const [schools, setSchools] = useState<SchoolGeofence[]>([]);
  const [search, setSearch] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editorOpen, setEditorOpen] = useState(startCreating);
  const [editing, setEditing] = useState<SchoolGeofence | null>(null);
  const [form, setForm] = useState<FormState>(blankForm);
  const [validation, setValidation] = useState<string[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => { setSearchTerm(search.trim()); setPage(1); }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  async function loadSchools(signal?: AbortSignal) {
    setLoading(true);
    try {
      const result = await fetchSchools({ page, limit: PAGE_LIMIT, search: searchTerm }, signal);
      if (signal?.aborted) return;
      setSchools(result.records);
      setTotal(result.pagination.total ?? result.records.length);
      setTotalPages(result.pagination.totalPages ?? (result.records.length ? 1 : 0));
      setError('');
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'Could not load geofences.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadSchools(controller.signal);
    return () => controller.abort();
  }, [page, searchTerm]);

  const openCreate = () => {
    setEditing(null);
    setForm(blankForm());
    setValidation([]);
    setNotice('');
    setError('');
    setEditorOpen(true);
  };

  const openEdit = async (school: SchoolGeofence) => {
    setSaving(true);
    setError('');
    try {
      const detailed = await fetchSchool(school.id);
      setEditing(detailed);
      setForm(toForm(detailed));
      setValidation([]);
      setEditorOpen(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load geofence details.');
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    const issues = validateForm(form);
    setValidation(issues);
    if (issues.length) return;
    setSaving(true);
    setError('');
    try {
      const payload = toPayload(form);
      if (editing) await updateSchool(editing.id, payload);
      else await createSchool(payload);
      setEditorOpen(false);
      setNotice(editing ? 'Geofence updated.' : 'Geofence created.');
      await loadSchools();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Save failed. Check the geofence API and try again.');
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (school: SchoolGeofence) => {
    setSaving(true);
    setError('');
    try {
      await updateSchool(school.id, toPayload({ ...toForm(school), enabled: !school.enabled }));
      await loadSchools();
      setNotice(`${school.name || school.id} ${school.enabled ? 'disabled' : 'enabled'}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not change geofence status.');
    } finally {
      setSaving(false);
    }
  };

  const removeOffice = async (office: SchoolGeofence) => {
    if (!window.confirm(`Delete geofence "${office.name || office.id}" and permanently remove its linked geofence events and delivery assignments?`)) return;
    setSaving(true);
    setError('');
    try {
      await deleteOffice(office.id);
      await loadSchools();
      setNotice(`${office.name || office.id} deleted.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete geofence.');
    } finally {
      setSaving(false);
    }
  };

  const mapFallback = useMemo(() => schools.find(isLocated), [schools]);
  const closeEditor = () => { setEditorOpen(false); setEditing(null); setValidation([]); };

  return <>
    {notice && <div className="school-notice"><span>✓</span>{notice}<button onClick={() => setNotice('')}>×</button></div>}
    {error && !editorOpen && <div className="error-banner"><span>⚠</span><div><b>Geofence API request failed</b><small>{error}</small></div><button onClick={() => void loadSchools()}>Retry</button></div>}
    {editorOpen ? <section className="panel school-editor-panel">
      <div className="panel-header"><div><h2>{editing ? 'Edit geofence' : 'Create geofence'}</h2><p>Set geofence coordinates and preview the boundary before saving.</p></div><button className="button secondary" onClick={closeEditor}>Cancel</button></div>
      {error && <div className="school-form-error"><b>Could not save geofence</b><span>{error}</span></div>}
      <div className="school-editor-layout">
        <div className="school-form">
          <Field label="Geofence name" error={validation.find(item => item.startsWith('Geofence name'))}><input name="geofenceName" value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Enter geofence name" /></Field>
          <div className="coordinate-fields"><Field label="Latitude" error={validation.find(item => item.startsWith('Latitude'))}><input name="latitude" type="number" step="any" value={form.latitude} onChange={event => setForm(current => ({ ...current, latitude: event.target.value }))} placeholder="e.g. 13.082700" /></Field><Field label="Longitude" error={validation.find(item => item.startsWith('Longitude'))}><input name="longitude" type="number" step="any" value={form.longitude} onChange={event => setForm(current => ({ ...current, longitude: event.target.value }))} placeholder="e.g. 80.270700" /></Field></div>
          <div className="field-error-line">{validation.filter(item => item.startsWith('Coordinates')).join(' ')}</div>
          <div className="geofence-type-control"><span>Boundary type</span><div><button className={form.geofenceType === 'CIRCLE' ? 'active' : ''} onClick={() => setForm(current => ({ ...current, geofenceType: 'CIRCLE', geometry: null }))}>Circle</button><button className={form.geofenceType === 'POLYGON' ? 'active' : ''} onClick={() => setForm(current => ({ ...current, geofenceType: 'POLYGON', geometry: current.geometry }))}>Polygon</button></div></div>
          {form.geofenceType === 'CIRCLE' ? <Field label="Radius (meters)" error={validation.find(item => item.startsWith('Radius'))}><input name="radiusMeters" type="number" min="1" step="1" value={form.radiusMeters} onChange={event => setForm(current => ({ ...current, radiusMeters: event.target.value }))} /></Field> : <div className={`draw-hint ${validation.some(item => item.startsWith('Polygon')) ? 'has-error' : ''}`}><b>{form.geometry ? 'Polygon boundary ready' : 'Draw a polygon on the map'}</b><span>Use the polygon tool in the map toolbar, click to add vertices, then finish the shape.</span></div>}
          <label className="enabled-toggle"><input name="enabled" type="checkbox" checked={form.enabled} onChange={event => setForm(current => ({ ...current, enabled: event.target.checked }))} /><span className="toggle-ui"/><span><b>Geofence enabled</b><small>Enabled fences are used for presence monitoring.</small></span></label>
          {editing && <AssignedDevices devices={form.assignedDevices} />}
          <div className="validation-list">{validation.map(message => <span key={message}>{message}</span>)}</div>
          <div className="school-form-actions"><button className="button secondary" onClick={closeEditor}>Cancel</button><button className="button primary" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create geofence'}</button></div>
        </div>
        <div className="school-preview"><div className="preview-title"><div><b>Boundary preview</b><small>{form.geofenceType === 'CIRCLE' ? `${form.radiusMeters || 0} meter radius` : form.geometry ? 'Polygon boundary' : 'Draw the boundary on the map'}</small></div><span>PREVIEW</span></div>
          {editorCenter(form, mapFallback) ? <EditorMap key={editing?.id || 'new-school'} form={form} fallback={mapFallback} onGeometryChange={geometry => setForm(current => ({ ...current, geometry }))} /> : <div className="editor-map-empty">Enter latitude and longitude, or load an existing geofence, to open its map preview.</div>}
          {form.geofenceType === 'POLYGON' && <div className="polygon-coordinate-count">{polygonVertexCount(form.geometry)} polygon vertices</div>}
        </div>
      </div>
    </section> : <section className="panel page-panel school-list-panel">
      <div className="panel-header"><div><h2>Geofence management</h2><p>{total} configured geofence{total === 1 ? '' : 's'} · search, configure, and preview boundaries</p></div><button className="button primary" onClick={openCreate}>＋ Create geofence</button></div>
      <div className="school-list-controls"><label className="search"><span>⌕</span><input name="geofenceSearch" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search geofences by name or ID" /></label><button className="button secondary" onClick={() => void loadSchools()}>⟳ Refresh</button></div>
      {error && <div className="school-form-error"><b>Could not load geofences</b><span>{error}</span></div>}
      {loading ? <div className="empty-state"><div className="spinner"/><b>Loading geofences</b><span>Fetching geofences from the admin API.</span></div> : schools.length ? <div className="school-table-wrap"><table className="school-table"><thead><tr><th>GEOFENCE</th><th>BOUNDARY</th><th>ASSIGNED TRUCKS</th><th>PRESENCE</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>{schools.map(school => <tr key={school.id}><td><div className="school-table-name"><b>{school.name || school.id}</b><small>{school.id} · {formatCoordinate(school.latitude)}, {formatCoordinate(school.longitude)}</small></div></td><td><span className="boundary-kind">{isPolygon(school) ? 'Polygon' : 'Circle · ' + (school.radiusMeters || 0) + 'm'}</span></td><td><AssignedDevices devices={deviceLabels(school)} compact /></td><td><span className={`presence-pill ${['PRESENT', 'INSIDE'].includes(String(school.presence).toUpperCase()) ? 'present' : ''}`}>{school.presence || 'UNKNOWN'}</span></td><td><button className={`status-toggle ${school.enabled ? 'enabled' : ''}`} disabled={saving} onClick={() => void toggleEnabled(school)} aria-label={`${school.enabled ? 'Disable' : 'Enable'} ${school.name || school.id}`}><span/>{school.enabled ? 'Enabled' : 'Disabled'}</button></td><td><button className="table-action" disabled={saving} onClick={() => void openEdit(school)}>Edit</button><button className="table-action" disabled={saving} onClick={() => void removeOffice(school)}>Delete</button></td></tr>)}</tbody></table></div> : <div className="empty-state"><div className="empty-icon">◎</div><b>{searchTerm ? 'No geofences match this search' : 'No geofences yet'}</b><span>{searchTerm ? 'Try another geofence name or identifier.' : 'Create an geofence to start monitoring this location.'}</span></div>}
      <div className="school-pagination"><small>Showing {schools.length ? (page - 1) * PAGE_LIMIT + 1 : 0}–{Math.min(page * PAGE_LIMIT, total)} of {total}</small><div><button disabled={page <= 1 || loading} onClick={() => setPage(current => current - 1)}>Previous</button><span>Page {page} of {Math.max(totalPages, 1)}</span><button disabled={page >= totalPages || loading} onClick={() => setPage(current => current + 1)}>Next</button></div></div>
    </section>}
  </>;
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) { return <label className={`school-field ${error ? 'field-invalid' : ''}`}><span>{label}</span>{children}{error && <small>{error}</small>}</label>; }
function AssignedDevices({ devices, compact = false }: { devices: Array<string | { id?: string; deviceId?: string; name?: string }>; compact?: boolean }) {
  if (!devices.length) return <span className="no-devices">No trucks assigned</span>;
  return <div className={`assigned-devices ${compact ? 'compact' : ''}`}>{!compact && <b>Assigned trucks</b>}{devices.map((device, index) => { const id = typeof device === 'string' ? device : device.deviceId || device.id || 'Truck'; const name = typeof device === 'string' ? device : device.name; return <span key={`${id}-${index}`} title={id}>{name || id}</span>; })}</div>;
}
function EditorMap({ form, fallback, onGeometryChange }: { form: FormState; fallback?: SchoolGeofence; onGeometryChange: (geometry: Geometry) => void }) {
  const center = editorCenter(form, fallback)!;
  const position: LatLngExpression = [center.latitude, center.longitude];
  const resetKey = `${form.geofenceType}:${fallback?.id || 'new'}`;
  return <MapContainer center={position} zoom={15} scrollWheelZoom className="school-editor-map"><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><EditorMapView center={position} /><BoundaryDrawControl resetKey={resetKey} geometry={form.geofenceType === 'POLYGON' ? form.geometry : null} onChange={onGeometryChange} enabled={form.geofenceType === 'POLYGON'} />{form.geofenceType === 'CIRCLE' && Number(form.radiusMeters) > 0 && <Circle center={position} radius={Number(form.radiusMeters)} pathOptions={{ color: '#238265', fillColor: '#40a988', fillOpacity: 0.18, weight: 2 }} />}<Marker position={position}><Popup>{form.name || 'Geofence'}<br />{formatCoordinate(center.latitude)}, {formatCoordinate(center.longitude)}</Popup></Marker></MapContainer>;
}

function BoundaryDrawControl({ resetKey, geometry, enabled, onChange }: { resetKey: string; geometry: Geometry; enabled: boolean; onChange: (geometry: Geometry) => void }) {
  const map = useMap();
  useEffect(() => {
    const featureGroup = new L.FeatureGroup();
    map.addLayer(featureGroup);
    if (enabled && geometry) {
      const rings = geometryRings(geometry);
      if (rings.length) featureGroup.addLayer(L.polygon(rings));
    }
  const draw = new L.Control.Draw({
      position: 'topleft',
      draw: { polygon: enabled ? { allowIntersection: false, showArea: true, shapeOptions: { color: '#238265', fillColor: '#40a988', fillOpacity: 0.16 } } : false, polyline: false, rectangle: false, circle: false, marker: false, circlemarker: false },
      edit: enabled ? { featureGroup, remove: true } : { featureGroup, edit: false, remove: false },
    });
    map.addControl(draw);
    const onCreated = (rawEvent: L.LeafletEvent) => {
      const event = rawEvent as L.DrawEvents.Created;
      featureGroup.clearLayers();
      featureGroup.addLayer(event.layer);
      onChange(layerGeometry(event.layer));
    };
    const onEdited = (rawEvent: L.LeafletEvent) => {
      const event = rawEvent as L.DrawEvents.Edited;
      event.layers.eachLayer(layer => { onChange(layerGeometry(layer)); });
    };
    const onDeleted = () => onChange(null);
    map.on(L.Draw.Event.CREATED, onCreated);
    map.on(L.Draw.Event.EDITED, onEdited);
    map.on(L.Draw.Event.DELETED, onDeleted);
    return () => {
      map.off(L.Draw.Event.CREATED, onCreated);
      map.off(L.Draw.Event.EDITED, onEdited);
      map.off(L.Draw.Event.DELETED, onDeleted);
      map.removeControl(draw);
      map.removeLayer(featureGroup);
    };
  }, [map, resetKey, enabled]);
  return null;
}
function EditorMapView({ center }: { center: LatLngExpression }) { const map = useMap(); const centerKey = JSON.stringify(center); useEffect(() => { map.setView(center); }, [map, centerKey]); return null; }

function toForm(school: SchoolGeofence): FormState {
  const geometry = school.geometry ?? school.polygon;
  const polygon = geometry && typeof geometry === 'object' && (geometry as { type?: string }).type === 'Polygon' ? geometry as Geometry : null;
  return {
    name: school.name || '', latitude: String(school.latitude ?? ''), longitude: String(school.longitude ?? ''), radiusMeters: String(school.radiusMeters ?? ''),
    enabled: school.enabled ?? true, geofenceType: school.geofenceType === 'POLYGON' || polygon ? 'POLYGON' : 'CIRCLE', geometry: polygon,
    assignedDevices: deviceLabels(school).map(device => typeof device === 'string' ? device : device.deviceId || device.id || ''),
  };
}
function toPayload(form: FormState): SchoolGeofenceInput {
  return { name: form.name.trim(), latitude: Number(form.latitude), longitude: Number(form.longitude), radiusMeters: form.geofenceType === 'CIRCLE' ? Number(form.radiusMeters) : Number(form.radiusMeters || 0), enabled: form.enabled, geofenceType: form.geofenceType, geometry: form.geofenceType === 'POLYGON' ? form.geometry : null, assignedDevices: form.assignedDevices };
}
function validateForm(form: FormState): string[] {
  const errors: string[] = [];
  if (!form.name.trim()) errors.push('Geofence name is required.');
  const latitude = Number(form.latitude);
  const longitude = Number(form.longitude);
  if (form.latitude === '' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) errors.push('Latitude must be between -90 and 90.');
  if (form.longitude === '' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) errors.push('Longitude must be between -180 and 180.');
  if (form.geofenceType === 'CIRCLE' && (!Number.isFinite(Number(form.radiusMeters)) || Number(form.radiusMeters) <= 0)) errors.push('Radius must be greater than zero meters.');
  if (form.geofenceType === 'POLYGON' && polygonVertexCount(form.geometry) < 3) errors.push('Polygon boundary needs at least three vertices.');
  return errors;
}
function deviceLabels(school: SchoolGeofence): NonNullable<SchoolGeofence['assignedDevices']> {
  if (school.assignedDevices?.length) return school.assignedDevices;
  return school.deviceId ? [school.deviceId] : [];
}
function isPolygon(school: SchoolGeofence): boolean {
  const shape = school.geometry ?? school.polygon;
  return school.geofenceType?.toUpperCase() === 'POLYGON' || Boolean(shape && typeof shape === 'object' && (shape as { type?: string }).type === 'Polygon');
}
function editorCenter(form: FormState, fallback?: SchoolGeofence) {
  const lat = Number(form.latitude);
  const lon = Number(form.longitude);
  if (form.latitude !== '' && form.longitude !== '' && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { latitude: lat, longitude: lon };
  return fallback && isLocated(fallback) ? { latitude: Number(fallback.latitude), longitude: Number(fallback.longitude) } : null;
}
function isLocated(school: SchoolGeofence) { return Number.isFinite(Number(school.latitude)) && Number.isFinite(Number(school.longitude)); }
function geometryRings(geometry: Geometry): LatLngExpression[][] {
  if (!geometry || !Array.isArray(geometry.coordinates)) return [];
  return geometry.coordinates.map(ring => ring.filter(pair => pair.length >= 2).map(([lon, lat]) => [Number(lat), Number(lon)] as LatLngExpression));
}
function polygonVertexCount(geometry: Geometry): number { return geometryRings(geometry).reduce((count, ring) => count + Math.max(ring.length - 1, 0), 0); }
function layerGeometry(layer: L.Layer): Geometry {
  if (!(layer instanceof L.Polygon)) return null;
  const raw = layer.getLatLngs();
  const rings: L.LatLng[][] = Array.isArray(raw[0]) ? raw as L.LatLng[][] : [raw as L.LatLng[]];
  const coordinates = rings.map(ring => {
    const coords = ring.map(point => [point.lng, point.lat]);
    if (coords.length && (coords[0][0] !== coords.at(-1)?.[0] || coords[0][1] !== coords.at(-1)?.[1])) coords.push([...coords[0]]);
    return coords;
  });
  return coordinates[0]?.length >= 4 ? { type: 'Polygon', coordinates } : null;
}
