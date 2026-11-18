export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface SchoolGeofence extends Coordinates {
  id: string;
  name?: string;
  radiusMeters: number;
  enabled?: boolean;
  geofenceType?: 'CIRCLE' | 'POLYGON' | string;
  assignedDevices?: Array<{ id?: string; deviceId?: string; name?: string } | string>;
  presence?: string;
  presenceUpdatedAt?: string | null;
  deviceId?: string | null;
  geometry?: { type?: string; coordinates?: unknown };
  polygon?: unknown;
  polygonCoordinates?: unknown;
}

export interface LocationRecord extends Coordinates {
  id?: string;
  schoolId?: string;
  schoolName?: string;
  deviceName?: string;
  status?: string;
  timestamp?: string;
  accuracy?: number;
  accuracyMeters?: number;
  heading?: number | null;
  deviceId?: string | null;
  receivedAt?: string;
}

export interface GeofenceEvent extends Coordinates {
  eventId?: string;
  schoolId: string;
  schoolName?: string;
  eventType: string;
  accuracy?: number;
  eventTime?: string;
  receivedAt?: string;
  deviceId?: string | null;
}

export interface DeliveryRecord {
  deliveryId?: string;
  schoolId: string;
  schoolName?: string;
  status?: string;
  receivedAt?: string;
  updatedAt?: string;
}

export interface DeviceRecord {
  deviceId: string;
  platform?: string;
  appVersion?: string | null;
  status?: string;
  active?: boolean;
  lastSeenAt?: string;
  latestGpsLocation?: LocationRecord | null;
  geofencePresence?: { status: string; school?: { id: string; name: string } | null };
  schools?: Array<{ assignedAt?: string; school: { id: string; name: string; active: boolean } }>;
}

export interface PageInfo {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
}

export interface SchoolGeofenceInput extends Coordinates {
  id?: string;
  name: string;
  radiusMeters: number;
  enabled: boolean;
  geofenceType: 'CIRCLE' | 'POLYGON';
  geometry: { type: 'Polygon'; coordinates: number[][][] } | null;
  assignedDevices: string[];
}

export interface PaginatedSchools {
  records: SchoolGeofence[];
  pagination: PageInfo;
}

export interface AdminData {
  offices: SchoolGeofence[];
  locations: LocationRecord[];
  events: GeofenceEvent[];
  deliveries: DeliveryRecord[];
  devices: DeviceRecord[];
  locationPage: PageInfo;
  eventPage: PageInfo;
  deliveryPage: PageInfo;
  office: (Coordinates & { radiusMeters: number }) | null;
  presence: string;
  dashboard: DashboardData;
}

export interface DashboardData {
  generatedAt: string;
  definitions: { activeDeviceWindowHours: number; staleGpsMinutes: number; eventDayTimezone: string; presenceSource: string };
  metrics: {
    totalRegisteredDevices: number;
    activeDevices: number;
    totalSchools: number;
    totalConfiguredGeofences: number;
    devicesInsideGeofences: number;
    devicesOutsideGeofences: number;
    todaysEntryEvents: number;
    todaysExitEvents: number;
    devicesWithStaleGps: number;
  };
  latestGpsLocations: PaginatedLocations;
  devicesInsideGeofences: { data: DeviceRecord[]; pagination: PageInfo };
  devicesOutsideGeofences: { data: DeviceRecord[]; pagination: PageInfo };
  staleDevices: { data: DeviceRecord[]; pagination: PageInfo };
}

export interface PaginatedLocations {
  records: LocationRecord[];
  pagination: PageInfo;
}

export interface LocationQuery {
  schoolId?: string;
  deviceId?: string;
  startDate?: string;
  endDate?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface GeofenceEventQuery {
  deviceId?: string;
  schoolId?: string;
  eventType?: 'ENTER' | 'EXIT';
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

type ApiEnvelope = {
  success?: boolean;
  message?: string;
  error?: string | { code?: string; message?: string };
  data?: unknown;
} & Record<string, unknown>;

declare const __ADMIN_API_BASE_URL__: string;
declare const __ADMIN_API_TOKEN__: string;

const adminApiBaseUrl = (__ADMIN_API_BASE_URL__ || 'http://localhost:3000/api').replace(/\/+$/, '');
const adminApiRoot = `${adminApiBaseUrl}/admin`;
const adminApiToken = __ADMIN_API_TOKEN__ || '';
export const adminDataUrl = `${adminApiRoot}/data`;
export const apiBaseUrl = adminApiBaseUrl;

function adminFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (adminApiToken) headers.set('Authorization', `Bearer ${adminApiToken}`);
  return fetch(input, { ...init, headers });
}

function getRecords<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') {
    const body = value as Record<string, unknown>;
    for (const key of ['data', 'records', 'locations', 'latestLocations', 'schools', 'items']) {
      if (Array.isArray(body[key])) return body[key] as T[];
    }
    if (body.data && typeof body.data === 'object') return getRecords<T>(body.data);
  }
  return [];
}

function getPage(value: unknown, count: number): PageInfo {
  if (!value || typeof value !== 'object') return { total: count };
  const body = value as Record<string, unknown>;
  if (body.pagination && typeof body.pagination === 'object') return body.pagination as PageInfo;
  if (body.data && typeof body.data === 'object') return getPage(body.data, count);
  return { total: count };
}

function schoolIdOf(item: Record<string, unknown>): string {
  const id = item.schoolId ?? item.officeId ?? item.locationId;
  return typeof id === 'string' ? id : '—';
}

function endpointUrl(path: string, query: LocationQuery = {}): string {
  const root = `${adminApiRoot}/locations`;
  const params = new URLSearchParams();
  const mapped = {
    schoolId: query.schoolId,
    deviceId: query.deviceId,
    from: query.from ?? (query.startDate ? new Date(`${query.startDate}T00:00:00.000Z`).toISOString() : undefined),
    to: query.to ?? (query.endDate ? new Date(`${query.endDate}T23:59:59.999Z`).toISOString() : undefined),
    page: query.page,
    limit: query.limit,
  };
  Object.entries(mapped).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  const suffix = params.size ? `?${params.toString()}` : '';
  return `${root}${path}${suffix}`;
}

function schoolEndpoint(path: string, query: { page?: number; limit?: number; search?: string; active?: boolean } = {}): string {
  const root = `${adminApiRoot}/schools`;
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  return `${root}${path}${params.size ? `?${params.toString()}` : ''}`;
}

function queryUrl(root: string, query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  return `${root}${params.size ? `?${params.toString()}` : ''}`;
}

function eventEndpoint(path = '', query: GeofenceEventQuery = {}): string {
  return queryUrl(`${adminApiRoot}/geofence-events${path}`, query as Record<string, string | number | undefined>);
}

function deviceEndpoint(path = '', query: Record<string, string | number | undefined> = {}): string {
  return queryUrl(`${adminApiRoot}/devices${path}`, query);
}

async function readEnvelope(response: Response): Promise<ApiEnvelope> {
  const envelope = await response.json().catch(() => ({})) as ApiEnvelope;
  if (!response.ok || envelope.success === false) {
    const error = typeof envelope.error === 'object' && envelope.error ? envelope.error.message : envelope.error;
    throw Object.assign(new Error(String(error || envelope.message || `API returned ${response.status}`)), { status: response.status });
  }
  return envelope;
}

async function requestJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await adminFetch(url, { signal, headers: { Accept: 'application/json' } });
  const envelope = await readEnvelope(response);
  return envelope.data ?? envelope;
}

function polygonPoints(geometry: SchoolGeofenceInput['geometry']): Coordinates[] {
  const ring = geometry?.coordinates[0] ?? [];
  const openRing = ring.length > 1 && ring[0]?.[0] === ring.at(-1)?.[0] && ring[0]?.[1] === ring.at(-1)?.[1]
    ? ring.slice(0, -1)
    : ring;
  return openRing.map(([longitude, latitude]) => ({ latitude, longitude }));
}

function schoolRequestBody(input: SchoolGeofenceInput, includeId: boolean): Record<string, unknown> {
  const slug = input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'school';
  const body: Record<string, unknown> = {
    name: input.name.trim(),
    active: input.enabled,
    deviceIds: input.assignedDevices,
    geofence: input.geofenceType === 'CIRCLE'
      ? { type: 'CIRCLE', latitude: input.latitude, longitude: input.longitude, radiusMeters: Math.round(input.radiusMeters) }
      : { type: 'POLYGON', coordinates: polygonPoints(input.geometry) },
  };
  if (includeId) body.id = input.id || `${slug}-${Date.now().toString(36)}`;
  return body;
}

async function mutateSchool(url: string, method: 'POST' | 'PUT', input: SchoolGeofenceInput): Promise<SchoolGeofence> {
  const response = await adminFetch(url, {
    method,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(schoolRequestBody(input, method === 'POST')),
  });
  const envelope = (await response.json().catch(() => ({}))) as ApiEnvelope;
  if (!response.ok || envelope.success === false) {
    const error = typeof envelope.error === 'object' && envelope.error ? envelope.error.message : envelope.error;
    throw Object.assign(new Error(String(error || envelope.message || `School API returned ${response.status}`)), { status: response.status });
  }
  return normalizeSchool(envelope.data ?? envelope);
}

function normalizeSchool(value: unknown): SchoolGeofence {
  const payload = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const school = payload.school && typeof payload.school === 'object' ? payload.school as Record<string, unknown> : payload;
  const geofence = school.geofence && typeof school.geofence === 'object' ? school.geofence as Record<string, unknown> : {};
  const coordinates = geofence.coordinates ?? school.polygonCoordinates;
  const rawPolygonCoordinates = Array.isArray(coordinates) && coordinates.length > 0 && typeof coordinates[0] === 'object'
    ? [[...coordinates as Array<{ latitude: number; longitude: number }>].map(point => [point.longitude, point.latitude])]
    : coordinates;
  const rawGeometry = school.geometry ?? school.polygon ?? (rawPolygonCoordinates ? { type: 'Polygon', coordinates: rawPolygonCoordinates } : null);
  const rawDevices = school.assignedDevices ?? school.devices;
  const rawEnabled = school.enabled ?? school.isEnabled ?? school.isActive ?? school.active;
  const assignedDevices = Array.isArray(rawDevices) ? rawDevices.map(device => {
    if (typeof device === 'string') return device;
    const item = device as Record<string, unknown>;
    return { id: String(item.id ?? ''), deviceId: String(item.deviceId ?? item.id ?? ''), name: String(item.name ?? '') };
  }) : school.deviceId ? [String(school.deviceId)] : [];
  return {
    ...school,
    id: String(school.id ?? school._id ?? ''),
    name: String(school.name ?? school.schoolName ?? ''),
    latitude: Number(school.latitude ?? geofence.latitude),
    longitude: Number(school.longitude ?? geofence.longitude),
    radiusMeters: Number(school.radiusMeters ?? school.radius ?? geofence.radiusMeters ?? 0),
    enabled: parseBoolean(rawEnabled, true),
    geofenceType: String(school.geofenceType ?? school.boundaryType ?? geofence.type ?? (rawGeometry ? 'POLYGON' : 'CIRCLE')).toUpperCase(),
    geometry: rawGeometry && typeof rawGeometry === 'object' ? rawGeometry as SchoolGeofence['geometry'] : undefined,
    polygon: rawGeometry,
    assignedDevices,
    deviceId: school.deviceId ? String(school.deviceId) : null,
  };
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  return !['false', '0', 'disabled', 'inactive', 'off'].includes(String(value).toLowerCase());
}

export async function fetchSchools(query: { page?: number; limit?: number; search?: string; active?: boolean } = {}, signal?: AbortSignal): Promise<PaginatedSchools> {
  const response = await adminFetch(schoolEndpoint('', query), { signal, headers: { Accept: 'application/json' } });
  const envelope = await readEnvelope(response);
  const payload = envelope.data ?? envelope;
  const records = getRecords<unknown>(payload).map(normalizeSchool);
  return { records, pagination: getPage(envelope, records.length) };
}

export async function fetchSchool(id: string, signal?: AbortSignal): Promise<SchoolGeofence> {
  const result = await requestJson(schoolEndpoint(`/${encodeURIComponent(id)}`), signal);
  return normalizeSchool(result);
}

export function createSchool(input: SchoolGeofenceInput): Promise<SchoolGeofence> {
  return mutateSchool(schoolEndpoint(''), 'POST', input);
}

export function updateSchool(id: string, input: SchoolGeofenceInput): Promise<SchoolGeofence> {
  return mutateSchool(schoolEndpoint(`/${encodeURIComponent(id)}`), 'PUT', input);
}

export async function deleteSchool(id: string): Promise<void> {
  const response = await adminFetch(schoolEndpoint(`/${encodeURIComponent(id)}`), { method: 'DELETE', headers: { Accept: 'application/json' } });
  const envelope = (await response.json().catch(() => ({}))) as ApiEnvelope;
  if (!response.ok || envelope.success === false) {
    const error = typeof envelope.error === 'object' && envelope.error ? envelope.error.message : envelope.error;
    throw Object.assign(new Error(String(error || envelope.message || `School API returned ${response.status}`)), { status: response.status });
  }
}

export async function deleteOffice(id: string): Promise<void> {
  const response = await adminFetch(`${adminApiRoot}/offices/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Accept: 'application/json' } });
  const envelope = (await response.json().catch(() => ({}))) as ApiEnvelope;
  if (!response.ok || envelope.success === false) {
    const error = typeof envelope.error === 'object' && envelope.error ? envelope.error.message : envelope.error;
    throw Object.assign(new Error(String(error || envelope.message || `Office API returned ${response.status}`)), { status: response.status });
  }
}

function locationRecords(payload: unknown): PaginatedLocations {
  const records = getRecords<Record<string, unknown>>(payload).map(normalizeLocation);
  return { records, pagination: getPage(payload, records.length) };
}

function normalizeLocation(item: Record<string, unknown>): LocationRecord {
  const device = item.device && typeof item.device === 'object' ? item.device as Record<string, unknown> : {};
  const school = item.school && typeof item.school === 'object' ? item.school as Record<string, unknown> : {};
  const rawAccuracy = item.accuracy ?? item.gpsAccuracy ?? item.accuracyMeters;
  return {
    ...item,
    id: String(item.id ?? item.locationId ?? ''),
    deviceId: String(item.deviceId ?? device.id ?? device.deviceId ?? '') || undefined,
    deviceName: String(item.deviceName ?? device.name ?? '') || undefined,
    schoolId: String(item.schoolId ?? school.id ?? item.officeId ?? '') || undefined,
    schoolName: String(item.schoolName ?? school.name ?? '') || undefined,
    latitude: Number(item.latitude),
    longitude: Number(item.longitude),
    accuracy: rawAccuracy == null ? undefined : Number(rawAccuracy),
    timestamp: String(item.recordedAt ?? item.timestamp ?? item.locationTimestamp ?? item.lastUpdatedAt ?? item.lastUpdated ?? item.createdAt ?? item.updatedAt ?? '') || undefined,
    status: String(item.status ?? item.geofenceStatus ?? item.presence ?? device.status ?? '') || undefined,
  };
}

export async function fetchLatestLocations(query: LocationQuery = {}, signal?: AbortSignal): Promise<PaginatedLocations> {
  return locationRecords(await requestJson(endpointUrl('/latest', query), signal));
}

export async function fetchLocationHistory(query: LocationQuery = {}, signal?: AbortSignal): Promise<PaginatedLocations> {
  return locationRecords(await requestJson(endpointUrl('/history', query), signal));
}

export async function fetchDeviceLocation(deviceId: string, signal?: AbortSignal): Promise<LocationRecord> {
  const device = await requestJson(deviceEndpoint(`/${encodeURIComponent(deviceId)}`), signal) as Record<string, unknown>;
  const location = device.latestGpsLocation;
  if (!location || typeof location !== 'object') throw new Error('Device has no GPS location yet');
  return normalizeLocation({ ...(location as Record<string, unknown>), device });
}

export function isApiNotFound(cause: unknown): boolean {
  return Boolean(cause && typeof cause === 'object' && 'status' in cause && (cause as { status: number }).status === 404);
}

export async function fetchDashboard(signal?: AbortSignal): Promise<DashboardData> {
  const value = await requestJson(`${adminApiRoot}/dashboard`, signal);
  if (!value || typeof value !== 'object') throw new Error('Dashboard API returned an invalid response');
  const payload = value as Record<string, unknown>;
  const metrics = payload.metrics;
  if (!metrics || typeof metrics !== 'object') throw new Error('Dashboard API response is missing metrics');
  const latest = payload.latestGpsLocations;
  const latestRecords = getRecords<Record<string, unknown>>(latest).map(normalizeLocation);
  return {
    ...(payload as unknown as DashboardData),
    metrics: metrics as DashboardData['metrics'],
    latestGpsLocations: { records: latestRecords, pagination: getPage(latest, latestRecords.length) },
  };
}

export async function fetchDevices(query: { page?: number; limit?: number; active?: boolean; schoolId?: string; search?: string } = {}, signal?: AbortSignal) {
  const response = await adminFetch(deviceEndpoint('', {
    page: query.page,
    limit: query.limit,
    active: query.active === undefined ? undefined : String(query.active),
    schoolId: query.schoolId,
    search: query.search,
  }), { signal, headers: { Accept: 'application/json' } });
  const envelope = await readEnvelope(response);
  const payload = envelope.data ?? envelope;
  const records = getRecords<DeviceRecord>(payload);
  return {
    records,
    pagination: getPage(envelope, records.length),
  };
}

export async function createDevice(input: { deviceId: string; platform: 'android' | 'ios'; appVersion?: string; schoolIds: string[] }): Promise<DeviceRecord> {
  const response = await adminFetch(deviceEndpoint(), {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  return await readEnvelope(response).then(envelope => envelope.data as DeviceRecord);
}

export async function updateDevice(deviceId: string, input: { platform?: 'android' | 'ios'; appVersion?: string | null; schoolIds?: string[] }): Promise<DeviceRecord> {
  const response = await adminFetch(deviceEndpoint(`/${encodeURIComponent(deviceId)}`), {
    method: 'PUT', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  return await readEnvelope(response).then(envelope => envelope.data as DeviceRecord);
}

export async function setDeviceActive(deviceId: string, active: boolean): Promise<DeviceRecord> {
  const response = await adminFetch(deviceEndpoint(`/${encodeURIComponent(deviceId)}/status`), {
    method: 'PATCH', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ active }),
  });
  return await readEnvelope(response).then(envelope => envelope.data as DeviceRecord);
}

export async function fetchGeofenceEvents(query: GeofenceEventQuery = {}, signal?: AbortSignal) {
  const response = await adminFetch(eventEndpoint('', query), { signal, headers: { Accept: 'application/json' } });
  const envelope = await readEnvelope(response);
  const payload = envelope.data ?? envelope;
  const records = getRecords<Record<string, unknown>>(payload).map(normalizeGeofenceEvent);
  return { records, pagination: getPage(envelope, records.length) };
}

function normalizeGeofenceEvent(item: Record<string, unknown>): GeofenceEvent {
  const school = item.school && typeof item.school === 'object' ? item.school as Record<string, unknown> : {};
  const device = item.device && typeof item.device === 'object' ? item.device as Record<string, unknown> : {};
  return {
    ...item,
    eventId: String(item.eventId ?? item.id ?? ''),
    schoolId: String(item.schoolId ?? school.id ?? ''),
    schoolName: String(item.schoolName ?? school.name ?? '') || undefined,
    eventType: String(item.eventType ?? '').toUpperCase(),
    latitude: Number(item.latitude),
    longitude: Number(item.longitude),
    accuracy: Number(item.accuracy),
    eventTime: String(item.eventTime ?? ''),
    receivedAt: String(item.receivedAt ?? ''),
    deviceId: String(item.deviceId ?? device.deviceId ?? '') || null,
  };
}

export async function exportGeofenceEvents(query: Omit<GeofenceEventQuery, 'page'> = {}): Promise<void> {
  const response = await adminFetch(eventEndpoint('/export', { ...query, limit: 10_000 }), { headers: { Accept: 'text/csv' } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as ApiEnvelope;
    const error = typeof body.error === 'object' && body.error ? body.error.message : body.error;
    throw new Error(String(error || `CSV export failed (${response.status})`));
  }
  const blob = await response.blob();
  saveBlob('geofence-events.csv', blob);
}

export async function fetchAdminData(signal?: AbortSignal): Promise<AdminData> {
  const [payloadValue, dashboard] = await Promise.all([requestJson(adminDataUrl, signal), fetchDashboard(signal)]);
  const payload = payloadValue as Record<string, unknown>;
  const offices = getRecords<unknown>(payload.offices).map(normalizeSchool);
  const officeNames = new Map(offices.map(office => [office.id, office.name]));
  const locations = getRecords<Record<string, unknown>>(payload.locations).map(normalizeLocation);
  const events = getRecords<Record<string, unknown>>(payload.geofenceEvents).map(normalizeGeofenceEvent).map(event => ({
    ...event,
    schoolName: event.schoolName || officeNames.get(event.schoolId),
  }));
  const deliveries = getRecords<Record<string, unknown>>(payload.deliveryStatusHistory).map(item => {
    const assignment = item.deliverySchool && typeof item.deliverySchool === 'object' ? item.deliverySchool as Record<string, unknown> : {};
    const school = assignment.school && typeof assignment.school === 'object' ? assignment.school as Record<string, unknown> : {};
    const delivery = assignment.delivery && typeof assignment.delivery === 'object' ? assignment.delivery as Record<string, unknown> : {};
    return {
      deliveryId: String(item.deliveryId ?? ''),
      schoolId: String(item.schoolId ?? ''),
      schoolName: String(school.name ?? officeNames.get(String(item.schoolId)) ?? ''),
      status: String(item.toStatus ?? assignment.status ?? ''),
      receivedAt: String(item.changedAt ?? ''),
      updatedAt: String(item.changedAt ?? ''),
      deliveryName: String(delivery.name ?? ''),
    };
  });

  return {
    offices,
    locations,
    events,
    deliveries,
    devices: [],
    locationPage: getPage(payload.locations, locations.length),
    eventPage: getPage(payload.geofenceEvents, events.length),
    deliveryPage: getPage(payload.deliveryStatusHistory, deliveries.length),
    office: (payload.office as AdminData['office']) ?? null,
    presence: String(payload.presence ?? 'UNKNOWN'),
    dashboard,
  };
}

export function downloadCsv(filename: string, rows: unknown[][]): void {
  const csv = rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
  saveBlob(filename, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
}

function saveBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
