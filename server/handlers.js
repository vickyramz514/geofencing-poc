/* eslint-env node */
const MAX_BODY_BYTES = 64 * 1024;

function receivedAt() {
  return new Date().toISOString();
}

function json(status, body) {
  return {status, body};
}

function requireObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'JSON object body is required';
  }
  return null;
}

function createStore() {
  return {
    locations: [],
    events: new Map(),
    deliveries: [],
  };
}

function handleRequest(store, request) {
  const method = request.method || 'GET';
  const path = request.path || '/';
  if (method === 'GET' && path === '/health') {
    return json(200, {ok: true});
  }
  if (method !== 'POST') {
    return json(404, {error: 'Not found'});
  }

  const invalid = requireObject(request.body);
  if (invalid) {
    return json(400, {error: invalid});
  }

  if (path === '/api/locations') {
    const item = {...request.body, receivedAt: receivedAt()};
    store.locations.push(item);
    return json(200, {receivedAt: item.receivedAt});
  }

  if (path === '/api/geofence-events') {
    const eventId = request.body.eventId || request.headers['idempotency-key'];
    if (!eventId || !request.body.schoolId || !request.body.eventType) {
      return json(400, {error: 'eventId, schoolId, and eventType are required'});
    }
    const existing = store.events.get(eventId);
    if (existing) {
      return json(200, {receivedAt: existing.receivedAt, duplicate: true});
    }
    const stored = {...request.body, eventId, receivedAt: receivedAt()};
    store.events.set(eventId, stored);
    return json(200, {receivedAt: stored.receivedAt, duplicate: false});
  }

  const deliveryMatch = path.match(/^\/api\/deliveries\/([^/]+)\/status$/);
  if (deliveryMatch) {
    if (!request.body.schoolId || !request.body.status) {
      return json(400, {error: 'schoolId and status are required'});
    }
    const item = {
      deliveryId: decodeURIComponent(deliveryMatch[1]),
      schoolId: request.body.schoolId,
      status: request.body.status,
      receivedAt: receivedAt(),
    };
    store.deliveries.push(item);
    return json(200, {receivedAt: item.receivedAt});
  }

  return json(404, {error: 'Not found'});
}

module.exports = {
  MAX_BODY_BYTES,
  createStore,
  handleRequest,
};
