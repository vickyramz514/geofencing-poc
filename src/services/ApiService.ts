import type {
  ApiReceipt,
  DeliveryStatusPayload,
  GeofenceEventPayload,
  LocationUploadPayload,
} from '../types';

export interface ApiClient {
  postLocation(body: LocationUploadPayload): Promise<ApiReceipt>;
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
    async postLocation() {
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
  const root = baseUrl.replace(/\/$/, '');

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

    const response = await fetchImpl(`${root}${path}`, {
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

  return {
    postLocation(body) {
      return postJson('/api/locations', body);
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
