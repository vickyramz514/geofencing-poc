import {createApiClient, createFetchApiClient} from '../ApiService';
import {resolveEnvironment} from '../../config/environment';

const geofenceBody = {
  eventId: 'school-001:ENTER:1',
  schoolId: 'school-001',
  eventType: 'ENTER' as const,
  latitude: 13.0827,
  longitude: 80.2707,
  accuracy: 10,
  eventTime: '2026-10-10T03:30:00.000Z',
};

describe('ApiService', () => {
  it('sends idempotency and authorization headers without putting the token in the body', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({receivedAt: '2026-10-10T03:30:01.000Z'}),
    }));
    const client = createFetchApiClient(
      'https://api.example.test/',
      fetchImpl,
      async () => 'secret-token',
    );

    await client.postGeofenceEvent(geofenceBody);

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.test/api/geofence-events',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Idempotency-Key': geofenceBody.eventId,
          Authorization: 'Bearer secret-token',
        }),
        body: JSON.stringify(geofenceBody),
      }),
    );
  });

  it('throws when the server rejects a location upload', async () => {
    const client = createFetchApiClient('https://api.example.test', async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    }));
    await expect(
      client.postLocation({
        latitude: 13,
        longitude: 80,
        accuracy: 10,
        timestamp: '2026-10-10T03:30:00.000Z',
      }),
    ).rejects.toThrow('status 503');
  });

  it('uses mock mode when the base URL is empty', async () => {
    expect(resolveEnvironment({apiBaseUrl: '', useMockApi: 'false'}).useMockApi).toBe(true);
    const client = createApiClient({
      baseUrl: '',
      useMock: false,
      now: () => new Date('2026-10-10T03:30:02.000Z'),
    });
    await expect(
      client.postDeliveryStatus('route-001', {
        schoolId: 'school-001',
        status: 'ARRIVED',
      }),
    ).resolves.toEqual({receivedAt: '2026-10-10T03:30:02.000Z'});
  });
});
