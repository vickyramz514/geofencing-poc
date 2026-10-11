import {LocationUploadService, type UploadScheduler} from '../LocationUploadService';
import {OfflineQueueService} from '../OfflineQueueService';
import {createMemoryStorage} from '../storage';
import type {ApiClient} from '../ApiService';
import type {GeofenceEvent, LocationFix} from '../../types';

function createScheduler() {
  const intervals: Array<{fn: () => void; ms: number}> = [];
  const timeouts: Array<{fn: () => void; ms: number}> = [];
  const scheduler: UploadScheduler = {
    setInterval(fn, ms) {
      intervals.push({fn, ms});
      return {id: intervals.length};
    },
    clearInterval() {
      intervals.splice(0, intervals.length);
    },
    setTimeout(fn, ms) {
      timeouts.push({fn, ms});
      return {id: timeouts.length};
    },
    clearTimeout(handle) {
      timeouts.splice(handle.id - 1, 1);
    },
  };
  return {scheduler, intervals, timeouts};
}

function createApi(): ApiClient {
  return {
    postLocation: jest.fn(async () => ({receivedAt: '2026-10-10T00:00:00.000Z'})),
    postOffice: jest.fn(async () => ({receivedAt: '2026-10-10T00:00:00.000Z'})),
    postGeofenceEvent: jest.fn(async () => ({receivedAt: '2026-10-10T00:00:01.000Z'})),
    postDeliveryStatus: jest.fn(async () => ({receivedAt: '2026-10-10T00:00:02.000Z'})),
  };
}

function fix(latitude: number): LocationFix {
  return {
    latitude,
    longitude: 80.2707,
    accuracy: 8,
    heading: 12,
    timestamp: 1_000,
  };
}

const event: GeofenceEvent = {
  eventId: 'school-001:ENTER:1:abc',
  schoolId: 'school-001',
  eventType: 'ENTER',
  latitude: 13.0827,
  longitude: 80.2707,
  accuracy: 8,
  eventTime: '2026-10-10T00:00:01.000Z',
  serverReceivedAt: null,
  uploadStatus: 'pending',
};

describe('LocationUploadService', () => {
  let now = 1_000_000;

  beforeEach(() => {
    now = 1_000_000;
  });

  function setup() {
    const api = createApi();
    const queue = new OfflineQueueService(createMemoryStorage(), () => now);
    const timers = createScheduler();
    const service = new LocationUploadService(api, queue, () => now, timers.scheduler);
    return {api, queue, service, ...timers};
  }

  it('throttles movement and still sends a stationary heartbeat', async () => {
    const {api, service} = setup();
    service.setTracking(true);
    await service.handleFix(fix(13.0827));
    now += 10_000;
    expect(await service.handleFix(fix(13.09))).toBe('throttled');
    now += 6_000;
    expect(await service.handleFix(fix(13.09))).toBe('sent');
    now += 31_000;
    expect(await service.handleFix(fix(13.09))).toBe('sent');
    expect(api.postLocation).toHaveBeenCalledTimes(3);
    service.dispose();
  });

  it('does not overlap requests and records success only after the response', async () => {
    const {api, service} = setup();
    let release: (value: {receivedAt: string}) => void = () => undefined;
    (api.postLocation as jest.Mock).mockImplementation(
      () =>
        new Promise(resolve => {
          release = resolve;
        }),
    );
    service.setTracking(true);
    const first = service.handleFix(fix(13));
    expect(service.getLastSuccessAt()).toBeNull();
    now += 60_000;
    const second = service.handleFix(fix(14));
    expect(api.postLocation).toHaveBeenCalledTimes(1);
    release({receivedAt: '2026-10-10T01:00:00.000Z'});
    await first;
    expect(await second).toBe('throttled');
    expect(service.getLastSuccessAt()).toBe('2026-10-10T01:00:00.000Z');
    service.dispose();
  });

  it('queues a failed location upload and retries after backoff', async () => {
    const {api, queue, service, timeouts} = setup();
    (api.postLocation as jest.Mock)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({receivedAt: '2026-10-10T02:00:00.000Z'});
    service.setTracking(true);
    expect(await service.handleFix(fix(13))).toBe('queued');
    expect(service.getLastSuccessAt()).toBeNull();
    expect((await queue.list())[0].attempts).toBe(1);
    expect(timeouts[0].ms).toBe(1000);

    now += 1000;
    timeouts[0].fn();
    await new Promise<void>(resolve => {
      setImmediate(() => resolve());
    });
    expect(api.postLocation).toHaveBeenCalledTimes(2);
    expect(service.getLastSuccessAt()).toBe('2026-10-10T02:00:00.000Z');
    expect(await queue.count()).toBe(0);
    service.dispose();
  });

  it('stops location uploads when tracking stops and still syncs delivery status', async () => {
    const {api, queue, service} = setup();
    service.setOnline(false);
    service.setTracking(true);
    await service.handleFix(fix(13));
    service.setTracking(false);
    service.setOnline(true);
    await service.flush();
    expect(api.postLocation).not.toHaveBeenCalled();
    expect(await queue.count()).toBe(1);

    service.setOnline(false);
    await service.sendDeliveryStatus({
      deliveryId: 'route-001',
      schoolId: 'school-001',
      status: 'DELIVERED',
    });
    service.setOnline(true);
    await service.flush();
    expect(api.postDeliveryStatus).toHaveBeenCalledWith('route-001', {
      schoolId: 'school-001',
      status: 'DELIVERED',
    });
    service.dispose();
  });

  it('uploads a geofence event immediately and ignores the duplicate', async () => {
    const {api, service} = setup();
    service.setTracking(true);
    await service.handleFix(fix(13));
    expect(await service.sendGeofenceEvent(event)).toBe('uploaded');
    expect(await service.sendGeofenceEvent(event)).toBe('duplicate');
    expect(api.postGeofenceEvent).toHaveBeenCalledTimes(1);
    expect(api.postLocation).toHaveBeenCalledTimes(1);
    service.dispose();
  });

  it('checks the stationary heartbeat on the foreground timer', async () => {
    const {api, service, intervals} = setup();
    service.setTracking(true);
    await service.handleFix(fix(13));
    expect(intervals[0].ms).toBe(5000);
    now += 31_000;
    intervals[0].fn();
    await new Promise<void>(resolve => {
      setImmediate(() => resolve());
    });
    expect(api.postLocation).toHaveBeenCalledTimes(2);
    service.dispose();
  });
});
