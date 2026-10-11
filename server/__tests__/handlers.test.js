const {createStore, handleRequest} = require('../handlers');

describe('geofence API handlers', () => {
  it('stores a location and returns receivedAt', () => {
    const store = createStore();
    const result = handleRequest(store, {
      method: 'POST',
      path: '/api/locations',
      headers: {},
      body: {latitude: 13.08, longitude: 80.27, accuracy: 8, timestamp: '2026-10-11T00:00:00.000Z'},
    });
    expect(result.status).toBe(200);
    expect(result.body.receivedAt).toEqual(expect.any(String));
    expect(store.locations).toHaveLength(1);
  });

  it('returns the original receipt for a repeated geofence event id', () => {
    const store = createStore();
    const body = {
      eventId: 'school-001:ENTER:1',
      schoolId: 'school-001',
      eventType: 'ENTER',
      latitude: 13.08,
      longitude: 80.27,
      accuracy: 8,
      eventTime: '2026-10-11T00:00:00.000Z',
    };
    const first = handleRequest(store, {
      method: 'POST',
      path: '/api/geofence-events',
      headers: {'idempotency-key': body.eventId},
      body,
    });
    const second = handleRequest(store, {
      method: 'POST',
      path: '/api/geofence-events',
      headers: {'idempotency-key': body.eventId},
      body,
    });
    expect(second.status).toBe(200);
    expect(second.body.receivedAt).toBe(first.body.receivedAt);
    expect(second.body.duplicate).toBe(true);
    expect(store.events.size).toBe(1);
  });

  it('records a delivery status', () => {
    const store = createStore();
    const result = handleRequest(store, {
      method: 'POST',
      path: '/api/deliveries/route-001/status',
      headers: {},
      body: {schoolId: 'school-001', status: 'ARRIVED'},
    });
    expect(result.status).toBe(200);
    expect(store.deliveries[0]).toMatchObject({
      deliveryId: 'route-001',
      schoolId: 'school-001',
      status: 'ARRIVED',
    });
  });
});
