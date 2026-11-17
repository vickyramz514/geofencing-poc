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
  id: string;
  name?: string;
  status?: string;
  lastSeen?: string;
  schoolId?: string;
  deviceType?: string;
}

export interface PageInfo {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
}

export interface SchoolGeofenceInput extends Coordinates {
  name: string;
  radiusMeters: number;
  enabled: boolean;
  geofenceType: 'CIRCLE' | 'POLYGON';
  geometry: { type: 'Polygon'; coordinates: number[][][] } | null;
  assignedDevices?: string[];
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
  page?: number;
  limit?: number;
}

type ApiEnvelope = {
  success?: boolean;
  message?: string;
  error?: string;
  data?: Record<string, unknown>;
} & Record<string, unknown>;

const adminProxyRoot = '/proxy/admin';
export const adminDataUrl = `${adminProxyRoot}/data`;
export const apiBaseUrl = 'Server-side authenticated proxy';

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
  if (!value || typeof value !== 'object' || !('pagination' in value)) return { total: count };
  return (value as { pagination?: PageInfo }).pagination ?? { total: count };
}

function schoolIdOf(item: Record<string, unknown>): string {
  const id = item.schoolId ?? item.officeId ?? item.locationId;
  return typeof id === 'string' ? id : '—';
}

function endpointUrl(path: string, query: LocationQuery = {}): string {
  const root = `${adminProxyRoot}/locations`;
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  const suffix = params.size ? `?${params.toString()}` : '';
  return `${root}${path}${suffix}`;
}

function schoolEndpoint(path: string, query: { page?: number; limit?: number; search?: string } = {}): string {
  const root = `${adminProxyRoot}/schools`;
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  return `${root}${path}${params.size ? `?${params.toString()}` : ''}`;
}

async function requestJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw Object.assign(new Error(`API returned ${response.status}`), { status: response.status });
  const envelope = (await response.json()) as ApiEnvelope;
  if (envelope.success === false) throw new Error(envelope.message || 'API returned success=false');
  return envelope.data ?? envelope;
}

async function mutateSchool(url: string, method: 'POST' | 'PUT', body: SchoolGeofenceInput): Promise<SchoolGeofence> {
  const response = await fetch(url, {
    method,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const envelope = (await response.json().catch(() => ({}))) as ApiEnvelope;
  if (!response.ok || envelope.success === false) {
    throw Object.assign(new Error(String(envelope.message || envelope.error || `School API returned ${response.status}`)), { status: response.status });
  }
  return normalizeSchool(envelope.data ?? envelope);
}

function normalizeSchool(value: unknown): SchoolGeofence {
  const payload = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const school = payload.school && typeof payload.school === 'object' ? payload.school as Record<string, unknown> : payload;
  const rawPolygonCoordinates = school.polygonCoordinates;
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
    latitude: Number(school.latitude),
    longitude: Number(school.longitude),
    radiusMeters: Number(school.radiusMeters ?? school.radius ?? 0),
    enabled: parseBoolean(rawEnabled, true),
    geofenceType: String(school.geofenceType ?? school.boundaryType ?? (rawGeometry ? 'POLYGON' : 'CIRCLE')).toUpperCase(),
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

export async function fetchSchools(query: { page?: number; limit?: number; search?: string } = {}, signal?: AbortSignal): Promise<PaginatedSchools> {
  const payload = await requestJson(schoolEndpoint('', query), signal);
  const records = getRecords<unknown>(payload).map(normalizeSchool);
  return { records, pagination: getPage(payload, records.length) };
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
  const response = await fetch(schoolEndpoint(`/${encodeURIComponent(id)}`), { method: 'DELETE', headers: { Accept: 'application/json' } });
  const envelope = (await response.json().catch(() => ({}))) as ApiEnvelope;
  if (!response.ok || envelope.success === false) {
    throw Object.assign(new Error(String(envelope.message || `School API returned ${response.status}`)), { status: response.status });
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
  const safeId = encodeURIComponent(deviceId);
  const item = await requestJson(endpointUrl(`/${safeId}`), signal);
  const records = getRecords<LocationRecord>(item);
  if (records[0]) return normalizeLocation(records[0] as unknown as Record<string, unknown>);
  if (item && typeof item === 'object' && 'latitude' in item && 'longitude' in item) return normalizeLocation(item as Record<string, unknown>);
  if (item && typeof item === 'object' && 'location' in item) return normalizeLocation((item as { location: Record<string, unknown> }).location);
  if (item && typeof item === 'object' && 'latestLocation' in item) return normalizeLocation((item as { latestLocation: Record<string, unknown> }).latestLocation);
  throw new Error('Device location was not present in the API response');
}

export function isApiNotFound(cause: unknown): boolean {
  return Boolean(cause && typeof cause === 'object' && 'status' in cause && (cause as { status: number }).status === 404);
}

export async function fetchAdminData(signal?: AbortSignal): Promise<AdminData> {
  const response = await fetch(adminDataUrl, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Admin API returned ${response.status}`);
  const envelope = (await response.json()) as ApiEnvelope;
  if (envelope.success === false) throw new Error(envelope.message || 'Admin API returned success=false');
  const payload = envelope.data ?? envelope;
  const offices = getRecords<SchoolGeofence>(payload.offices);
  const officeNames = new Map(offices.map(office => [office.id, office.name]));
  const locations = getRecords<LocationRecord>(payload.locations).map(item => ({
    ...item,
    timestamp: item.timestamp || item.receivedAt,
  }));
  const events = getRecords<GeofenceEvent>(payload.geofenceEvents ?? payload.events).map(item => {
    const raw = item as unknown as Record<string, unknown>;
    const schoolId = schoolIdOf(raw);
    return {
      ...item,
      schoolId,
      schoolName: item.schoolName || officeNames.get(schoolId),
      eventType: String(raw.eventType ?? raw.type ?? raw.event ?? '').toUpperCase(),
      eventTime: item.eventTime || String(raw.timestamp ?? raw.occurredAt ?? raw.createdAt ?? ''),
    };
  });
  const deliveries = getRecords<DeliveryRecord>(payload.deliveryStatusHistory ?? payload.deliveries).map(item => ({
    ...item,
    schoolName: item.schoolName || officeNames.get(item.schoolId),
  }));

  return {
    offices,
    locations,
    events,
    deliveries,
    devices: getRecords<DeviceRecord>(payload.devices),
    locationPage: getPage(payload.locations, locations.length),
    eventPage: getPage(payload.geofenceEvents ?? payload.events, events.length),
    deliveryPage: getPage(payload.deliveryStatusHistory ?? payload.deliveries, deliveries.length),
    office: (payload.office as AdminData['office']) ?? null,
    presence: String(payload.presence ?? 'UNKNOWN'),
  };
}

export function downloadCsv(filename: string, rows: unknown[][]): void {
  const csv = rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
