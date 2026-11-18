import type {
  ApiReceipt,
  DeliveryStatusPayload,
  DeviceRegistrationPayload,
  RegisteredDevice,
  GeofenceEventPayload,
  LocationUploadPayload,
  OfficeLocation,
  OfficeGeofencePayload,
} from '../types';

export interface ApiClient {
  registerDevice(body: DeviceRegistrationPayload): Promise<ApiReceipt>;
  getRegisteredDevice(deviceId: string): Promise<RegisteredDevice | null>;
  getOffice(officeId?: string): Promise<OfficeLocation | null>;
  getOffices(): Promise<OfficeLocation[]>;
  postLocation(body: LocationUploadPayload): Promise<ApiReceipt>;
  postOffice(body: OfficeGeofencePayload): Promise<ApiReceipt>;
  postGeofenceEvent(body: GeofenceEventPayload): Promise<ApiReceipt>;
  postDeliveryStatus(
    deliveryId: string,
    body: DeliveryStatusPayload,
  ): Promise<ApiReceipt>;
}

export interface FetchLike {
  (input: string, init?: RequestInit): Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
  }>;
}

export interface ApiClientOptions {
  baseUrl: string;
  useMock: boolean;
  getAuthToken?: () => Promise<string | null>;
  fetchImpl?: FetchLike;
  now?: () => Date;
}

function receiptFrom(body: unknown, now: Date): ApiReceipt {
  if (
    body &&
    typeof body === 'object' &&
    'receivedAt' in body &&
    typeof body.receivedAt === 'string'
  ) {
    return {receivedAt: body.receivedAt};
  }
  return {receivedAt: now.toISOString()};
}

export function createMockApiClient(now: () => Date = () => new Date()): ApiClient {
  return {
    async registerDevice() {
      return {receivedAt: now().toISOString()};
    },
    async getRegisteredDevice() {
      return null;
    },
    async getOffice() {
      return null;
    },
    async getOffices() {
      return [];
    },
    async postLocation() {
      return {receivedAt: now().toISOString()};
    },
    async postOffice() {
      return {receivedAt: now().toISOString()};
    },
    async postGeofenceEvent() {
      return {receivedAt: now().toISOString()};
    },
    async postDeliveryStatus() {
      return {receivedAt: now().toISOString()};
    },
  };
}

export function createFetchApiClient(
  baseUrl: string,
  fetchImpl: FetchLike,
  getAuthToken?: () => Promise<string | null>,
  now: () => Date = () => new Date(),
): ApiClient {
  const root = baseUrl.replace(/\/$/, '').replace(/\/api$/i, '');

  async function fetchWithTimeout(path: string, input: string, init: RequestInit) {
    let timeout: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        reject(new Error(`Request to ${path} timed out after 10 seconds. Check that the API is running and reachable.`));
      }, 10_000);
    });
    try {
      return await Promise.race([fetchImpl(input, init), timeoutPromise]);
    } finally {
      clearTimeout(timeout!);
    }
  }

  async function postJson(
    path: string,
    body: unknown,
    idempotencyKey?: string,
  ): Promise<ApiReceipt> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }
    const token = getAuthToken ? await getAuthToken() : null;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetchWithTimeout(path, `${root}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Request to ${path} failed with status ${response.status}`);
    }
    const json = await response.json().catch(() => ({}));
    return receiptFrom(json, now());
  }

  async function getOffice(officeId?: string): Promise<OfficeLocation | null> {
    const token = getAuthToken ? await getAuthToken() : null;
    const path = officeId ? `/api/office?id=${encodeURIComponent(officeId)}` : '/api/office';
    const response = await fetchWithTimeout(path, `${root}${path}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(token ? {Authorization: `Bearer ${token}`} : {}),
      },
    });
    if (!response.ok) throw new Error(`Request to ${path} failed with status ${response.status}`);
    const payload = await response.json().catch(() => ({}));
    if (!payload || typeof payload !== 'object') return null;
    const envelope = payload as Record<string, unknown>;
    const data = envelope.data && typeof envelope.data === 'object' ? envelope.data as Record<string, unknown> : envelope;
    const office = data.office && typeof data.office === 'object' ? data.office as Record<string, unknown> : data;
    const latitude = Number(office.latitude);
    const longitude = Number(office.longitude);
    const radiusMeters = Number(office.radiusMeters);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !(radiusMeters > 0)) return null;
    return {
      id: typeof office.id === 'string' ? office.id : undefined,
      name: typeof office.name === 'string' ? office.name : undefined,
      latitude,
      longitude,
      radiusMeters,
      presence: typeof data.presence === 'string' ? data.presence : undefined,
    };
  }

  async function getRegisteredDevice(deviceId: string): Promise<RegisteredDevice | null> {
    const path = `/api/devices/${encodeURIComponent(deviceId)}`;
    const token = getAuthToken ? await getAuthToken() : null;
    const response = await fetchWithTimeout(path, `${root}${path}`, {
      method: 'GET',
      headers: {Accept: 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})},
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Request to ${path} failed with status ${response.status}`);
    const payload = await response.json().catch(() => ({}));
    if (!payload || typeof payload !== 'object') return null;
    const envelope = payload as Record<string, unknown>;
    const data = envelope.data && typeof envelope.data === 'object' ? envelope.data as Record<string, unknown> : null;
    if (!data || typeof data.deviceId !== 'string') return null;
    return {deviceId: data.deviceId, deviceName: typeof data.deviceName === 'string' ? data.deviceName : undefined};
  }

  async function getOffices(): Promise<OfficeLocation[]> {
    const token = getAuthToken ? await getAuthToken() : null;
    const response = await fetchWithTimeout('/api/office/list', `${root}/api/office/list`, {
      method: 'GET',
      headers: {Accept: 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})},
    });
    if (response.status === 404) {
      const fallback = await getOffice();
      return fallback ? [fallback] : [];
    }
    if (!response.ok) throw new Error(`Request to /api/office/list failed with status ${response.status}`);
    const payload = await response.json().catch(() => ({}));
    if (!payload || typeof payload !== 'object') return [];
    const envelope = payload as Record<string, unknown>;
    const data = envelope.data && typeof envelope.data === 'object' ? envelope.data as Record<string, unknown> : envelope;
    const records = Array.isArray(data.offices) ? data.offices : [];
    return records.flatMap((value): OfficeLocation[] => {
      if (!value || typeof value !== 'object') return [];
      const item = value as Record<string, unknown>;
      const latitude = Number(item.latitude);
      const longitude = Number(item.longitude);
      const radiusMeters = Number(item.radiusMeters);
      if (typeof item.id !== 'string' || !Number.isFinite(latitude) || !Number.isFinite(longitude) || !(radiusMeters > 0)) return [];
      return [{id: item.id, name: typeof item.name === 'string' ? item.name : undefined, latitude, longitude, radiusMeters}];
    });
  }

  return {
    registerDevice(body) {
      return postJson('/api/devices/register', body);
    },
    getRegisteredDevice,
    getOffice,
    getOffices,
    postLocation(body) {
      return postJson('/api/locations', body);
    },
    postOffice(body) {
      return postJson('/api/office', body);
    },
    postGeofenceEvent(body) {
      return postJson('/api/geofence-events', body, body.eventId);
    },
    postDeliveryStatus(deliveryId, body) {
      return postJson(`/api/deliveries/${encodeURIComponent(deliveryId)}/status`, body);
    },
  };
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  if (options.useMock || options.baseUrl.trim().length === 0) {
    return createMockApiClient(options.now);
  }
  return createFetchApiClient(
    options.baseUrl,
    options.fetchImpl ?? (fetch as FetchLike),
    options.getAuthToken,
    options.now,
  );
}
