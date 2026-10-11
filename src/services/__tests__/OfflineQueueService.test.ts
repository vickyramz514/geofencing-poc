import {OfflineQueueService} from '../OfflineQueueService';
import {createMemoryStorage} from '../storage';
import type {QueueItem} from '../../types';

function locationItem(id: string): QueueItem['payload'] {
  return {
    latitude: 13.0827,
    longitude: 80.2707,
    accuracy: 8,
    timestamp: `2026-10-10T00:00:00.${id}Z`,
  };
}

describe('OfflineQueueService', () => {
  it('keeps failed items and retries them with exponential backoff', async () => {
    let now = 5_000;
    const queue = new OfflineQueueService(createMemoryStorage(), () => now);
    await queue.enqueue({
      kind: 'location',
      idempotencyKey: 'location:1',
      payload: locationItem('1'),
    });

    const send = jest
      .fn<Promise<void>, [QueueItem]>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);

    const failed = await queue.sync({isOnline: true, send});
    expect(failed).toEqual({synced: 0, failed: 1, skipped: false});
    expect((await queue.list())[0].attempts).toBe(1);
    expect((await queue.list())[0].nextRetryAtMs).toBe(6_000);

    now = 5_999;
    await queue.sync({isOnline: true, send});
    expect(send).toHaveBeenCalledTimes(1);

    now = 6_000;
    const synced = await queue.sync({isOnline: true, send});
    expect(synced.synced).toBe(1);
    expect(await queue.count()).toBe(0);
  });

  it('does not sync while offline', async () => {
    const queue = new OfflineQueueService(createMemoryStorage(), () => 0);
    await queue.enqueue({
      kind: 'location',
      idempotencyKey: 'location:1',
      payload: locationItem('1'),
    });
    const send = jest.fn(async () => undefined);
    const result = await queue.sync({isOnline: false, send});
    expect(result.skipped).toBe(true);
    expect(send).not.toHaveBeenCalled();
    expect(await queue.count()).toBe(1);
  });

  it('prevents duplicate geofence event uploads across retries', async () => {
    const queue = new OfflineQueueService(createMemoryStorage(), () => 10);
    const payload = {
      eventId: 'school-001:ENTER:10:abc',
      schoolId: 'school-001',
      eventType: 'ENTER' as const,
      latitude: 13,
      longitude: 80,
      accuracy: 5,
      eventTime: '2026-10-10T00:00:00.000Z',
    };
    expect(
      await queue.enqueue({
        kind: 'geofence-event',
        idempotencyKey: payload.eventId,
        payload,
      }),
    ).toBe(true);
    expect(
      await queue.enqueue({
        kind: 'geofence-event',
        idempotencyKey: payload.eventId,
        payload,
      }),
    ).toBe(false);

    await queue.sync({
      isOnline: true,
      send: async () => undefined,
    });
    expect(
      await queue.enqueue({
        kind: 'geofence-event',
        idempotencyKey: payload.eventId,
        payload,
      }),
    ).toBe(false);
    expect(await queue.count()).toBe(0);
  });

  it('does not send a second request while the first sync is still running', async () => {
    const queue = new OfflineQueueService(createMemoryStorage(), () => 10);
    await queue.enqueue({
      kind: 'location',
      idempotencyKey: 'location:1',
      payload: locationItem('1'),
    });
    let release: (() => void) | undefined;
    const send = jest.fn(
      () =>
        new Promise<void>(resolve => {
          release = resolve;
        }),
    );

    const first = queue.sync({isOnline: true, send});
    const second = queue.sync({isOnline: true, send});
    await new Promise<void>(resolve => {
      setImmediate(() => resolve());
    });
    expect(send).toHaveBeenCalledTimes(1);
    release?.();
    await Promise.all([first, second]);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
