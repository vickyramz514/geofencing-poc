export type DeliveryStatus =
  | 'PENDING'
  | 'IN_TRANSIT'
  | 'ARRIVED'
  | 'DELIVERED'
  | 'FITTING_IN_PROGRESS'
  | 'COMPLETED';

export type GeofenceEventType = 'ENTER' | 'EXIT';

export type UploadStatus = 'pending' | 'uploaded' | 'failed';

export type Presence = 'inside' | 'outside';

export type TrackingStatus = 'idle' | 'starting' | 'tracking' | 'stopped';

export type LocationErrorCode =
  | 'permission-denied'
  | 'permission-restricted'
  | 'gps-disabled'
  | 'timeout'
  | 'unavailable'
  | 'unknown';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface LocationFix extends Coordinates {
  accuracy: number;
  heading: number | null;
  timestamp: number;
}

export interface School extends Coordinates {
  id: string;
  name: string;
  address: string;
  radiusMeters: number;
  color: string;
  deliveryNote: string;
}

export interface DeliveryRoute {
  id: string;
  name: string;
  schoolIds: string[];
}

export interface GeofenceEvent {
  eventId: string;
  schoolId: string;
  eventType: GeofenceEventType;
  latitude: number;
  longitude: number;
  accuracy: number;
  eventTime: string;
  serverReceivedAt: string | null;
  uploadStatus: UploadStatus;
}

export interface OfficeGeofencePayload {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  anchoredAt: string;
}

export interface LocationUploadPayload {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
}

export interface GeofenceEventPayload {
  eventId: string;
  schoolId: string;
  eventType: GeofenceEventType;
  latitude: number;
  longitude: number;
  accuracy: number;
  eventTime: string;
}

export interface DeliveryStatusPayload {
  schoolId: string;
  status: DeliveryStatus;
}

export interface ApiReceipt {
  receivedAt: string;
}

export type QueueKind = 'location' | 'geofence-event' | 'delivery-status';

export interface QueueItem {
  id: string;
  kind: QueueKind;
  idempotencyKey: string;
  payload: LocationUploadPayload | GeofenceEventPayload | DeliveryStatusPayload;
  deliveryId?: string;
  attempts: number;
  nextRetryAtMs: number;
  createdAtMs: number;
}

export interface GeofenceRegion {
  schoolId: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export interface GeofenceTransition {
  schoolId: string;
  eventType: GeofenceEventType;
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export interface MonitoringStatus {
  active: boolean;
  mode: 'foreground-gps';
  backgroundMonitoring: 'not-enabled';
  schoolIds: string[];
}

export class LocationTrackingError extends Error {
  readonly code: LocationErrorCode;

  constructor(message: string, code: LocationErrorCode) {
    super(message);
    this.name = 'LocationTrackingError';
    this.code = code;
  }
}
