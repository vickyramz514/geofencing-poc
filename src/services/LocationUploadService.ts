import type {ApiClient} from './ApiService';
import type {OfflineQueueService} from './OfflineQueueService';
import type {
  DeliveryStatus,
  GeofenceEvent,
  GeofenceEventPayload,
  LocationFix,
  LocationUploadPayload,
  QueueItem,
} from '../types';
import {backoffDelayMs} from '../utils/retry';
import {
  decideLocationUpload,
  HEARTBEAT_CHECK_MS,
} from '../utils/uploadPolicy';

export type UploadListenerEvent =
  | {type: 'location-uploaded'; receivedAt: string}
  | {type: 'geofence-uploaded'; eventId: string; receivedAt: string}
  | {type: 'queue-changed'};

export interface TimerHandle {
  id: number;
}

export interface UploadScheduler {
  setInterval(fn: () => void, ms: number): TimerHandle;
  clearInterval(handle: TimerHandle): void;
  setTimeout(fn: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

const defaultScheduler: UploadScheduler = {
  setInterval(fn, ms) {
    return {id: setInterval(fn, ms) as unknown as number};
  },
  clearInterval(handle) {
    clearInterval(handle.id);
  },
  setTimeout(fn, ms) {
    return {id: setTimeout(fn, ms) as unknown as number};
  },
  clearTimeout(handle) {
    clearTimeout(handle.id);
  },
};

export type GeofenceUploadStatus = 'uploaded' | 'queued' | 'duplicate';
export type LocationUploadStatus = 'sent' | 'queued' | 'throttled' | 'stopped';
export type DeliveryUploadStatus = 'uploaded' | 'queued';

function toGeofencePayload(event: GeofenceEvent): GeofenceEventPayload {
  return {
    eventId: event.eventId,
    schoolId: event.schoolId,
    eventType: event.eventType,
    latitude: event.latitude,
    longitude: event.longitude,
    accuracy: event.accuracy,
    eventTime: event.eventTime,
  };
}

export class LocationUploadService {
  private tracking = false;
  private online = true;
  private inFlight = false;
  private lastAttempt: {
    latitude: number;
    longitude: number;
    atMs: number;
  } | null = null;
  private lastSuccessAt: string | null = null;
  private lastFix: LocationFix | null = null;
  private heartbeatTimer: TimerHandle | null = null;
  private retryTimer: TimerHandle | null = null;
  private readonly inFlightEventIds = new Set<string>();
  private readonly listeners = new Set<(event: UploadListenerEvent) => void>();

  constructor(
    private readonly api: ApiClient,
    private readonly queue: OfflineQueueService,
    private readonly now: () => number = Date.now,
    private readonly scheduler: UploadScheduler = defaultScheduler,
  ) {}

  setTracking(tracking: boolean): void {
    this.tracking = tracking;
    if (!tracking) {
      this.clearHeartbeat();
      return;
    }
    if (this.heartbeatTimer == null) {
      this.heartbeatTimer = this.scheduler.setInterval(() => {
        if (this.lastFix && this.tracking) {
          this.handleFix(this.lastFix).catch(() => undefined);
        }
      }, HEARTBEAT_CHECK_MS);
    }
  }

  setOnline(online: boolean): void {
    this.online = online;
  }

  subscribe(listener: (event: UploadListenerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getLastSuccessAt(): string | null {
    return this.lastSuccessAt;
  }

  isInFlight(): boolean {
    return this.inFlight;
  }

  async handleFix(fix: LocationFix): Promise<LocationUploadStatus> {
    this.lastFix = fix;
    if (!this.tracking) {
      return 'stopped';
    }

    const decision = decideLocationUpload({
      nowMs: this.now(),
      latitude: fix.latitude,
      longitude: fix.longitude,
      lastAttemptAtMs: this.lastAttempt?.atMs ?? null,
      lastLatitude: this.lastAttempt?.latitude ?? null,
      lastLongitude: this.lastAttempt?.longitude ?? null,
      inFlight: this.inFlight,
      tracking: this.tracking,
    });
    if (!decision.shouldUpload) {
      return 'throttled';
    }

    const payload: LocationUploadPayload = {
      latitude: fix.latitude,
      longitude: fix.longitude,
      accuracy: fix.accuracy,
      timestamp: new Date(this.now()).toISOString(),
    };
    this.inFlight = true;
    this.lastAttempt = {
      latitude: fix.latitude,
      longitude: fix.longitude,
      atMs: this.now(),
    };

    try {
      if (!this.online) {
        await this.queue.enqueue({
          kind: 'location',
          idempotencyKey: `location:${payload.timestamp}`,
          payload,
        });
        this.emit({type: 'queue-changed'});
        return 'queued';
      }

      const receipt = await this.api.postLocation(payload);
      this.lastSuccessAt = receipt.receivedAt;
      this.emit({type: 'location-uploaded', receivedAt: receipt.receivedAt});
      return 'sent';
    } catch {
      const delay = backoffDelayMs(1);
      await this.queue.enqueue({
        kind: 'location',
        idempotencyKey: `location:${payload.timestamp}`,
        payload,
        attempts: 1,
        nextRetryAtMs: this.now() + delay,
      });
      this.scheduleRetry(delay);
      this.emit({type: 'queue-changed'});
      return 'queued';
    } finally {
      this.inFlight = false;
    }
  }

  async sendGeofenceEvent(event: GeofenceEvent): Promise<GeofenceUploadStatus> {
    if (this.inFlightEventIds.has(event.eventId)) {
      return 'duplicate';
    }
    this.inFlightEventIds.add(event.eventId);
    const payload = toGeofencePayload(event);
    try {
      if (await this.queue.hasSeen(event.eventId)) {
        return 'duplicate';
      }
      if (!this.online) {
        await this.queue.enqueue({
          kind: 'geofence-event',
          idempotencyKey: event.eventId,
          payload,
        });
        this.emit({type: 'queue-changed'});
        return 'queued';
      }
      const receipt = await this.api.postGeofenceEvent(payload);
      await this.queue.rememberSent(event.eventId);
      this.emit({
        type: 'geofence-uploaded',
        eventId: event.eventId,
        receivedAt: receipt.receivedAt,
      });
      return 'uploaded';
    } catch {
      const delay = backoffDelayMs(1);
      await this.queue.enqueue({
        kind: 'geofence-event',
        idempotencyKey: event.eventId,
        payload,
        attempts: 1,
        nextRetryAtMs: this.now() + delay,
      });
      this.scheduleRetry(delay);
      this.emit({type: 'queue-changed'});
      return 'queued';
    } finally {
      this.inFlightEventIds.delete(event.eventId);
    }
  }

  async sendDeliveryStatus(input: {
    deliveryId: string;
    schoolId: string;
    status: DeliveryStatus;
  }): Promise<DeliveryUploadStatus> {
    const payload = {schoolId: input.schoolId, status: input.status};
    const idempotencyKey = `delivery:${input.deliveryId}:${input.schoolId}:${input.status}`;
    if (!this.online) {
      await this.queue.enqueue({
        kind: 'delivery-status',
        idempotencyKey,
        payload,
        deliveryId: input.deliveryId,
      });
      this.emit({type: 'queue-changed'});
      return 'queued';
    }
    try {
      await this.api.postDeliveryStatus(input.deliveryId, payload);
      await this.queue.rememberSent(idempotencyKey);
      return 'uploaded';
    } catch {
      const delay = backoffDelayMs(1);
      await this.queue.enqueue({
        kind: 'delivery-status',
        idempotencyKey,
        payload,
        deliveryId: input.deliveryId,
        attempts: 1,
        nextRetryAtMs: this.now() + delay,
      });
      this.scheduleRetry(delay);
      this.emit({type: 'queue-changed'});
      return 'queued';
    }
  }

  async flush(): Promise<void> {
    const result = await this.queue.sync({
      isOnline: this.online,
      include: item => (item.kind === 'location' ? this.tracking : true),
      send: item => this.dispatch(item),
    });
    if (result.synced > 0 || result.failed > 0) {
      this.emit({type: 'queue-changed'});
    }
  }

  dispose(): void {
    this.tracking = false;
    this.clearHeartbeat();
    this.clearRetry();
  }

  private async dispatch(item: QueueItem): Promise<void> {
    if (item.kind === 'location') {
      const receipt = await this.api.postLocation(
        item.payload as LocationUploadPayload,
      );
      this.lastSuccessAt = receipt.receivedAt;
      this.emit({type: 'location-uploaded', receivedAt: receipt.receivedAt});
      return;
    }
    if (item.kind === 'geofence-event') {
      const payload = item.payload as GeofenceEventPayload;
      const receipt = await this.api.postGeofenceEvent(payload);
      this.emit({
        type: 'geofence-uploaded',
        eventId: payload.eventId,
        receivedAt: receipt.receivedAt,
      });
      return;
    }
    if (!item.deliveryId) {
      throw new Error('Delivery status update is missing a delivery id.');
    }
    await this.api.postDeliveryStatus(
      item.deliveryId,
      item.payload as {schoolId: string; status: DeliveryStatus},
    );
  }

  private scheduleRetry(delayMs: number): void {
    if (this.retryTimer) {
      return;
    }
    this.retryTimer = this.scheduler.setTimeout(() => {
      this.retryTimer = null;
      this.flush().catch(() => undefined);
    }, delayMs);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      this.scheduler.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private clearRetry(): void {
    if (this.retryTimer) {
      this.scheduler.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private emit(event: UploadListenerEvent): void {
    this.listeners.forEach(listener => listener(event));
  }
}
