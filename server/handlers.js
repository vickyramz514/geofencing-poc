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
    office: null,
    presence: 'UNKNOWN',
  };
}

function haversineMeters(origin, destination) {
  const earth = 6371000;
  const toRadians = degrees => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(destination.latitude - origin.latitude);
  const longitudeDelta = toRadians(destination.longitude - origin.longitude);
  const originLatitude = toRadians(origin.latitude);
  const destinationLatitude = toRadians(destination.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitude) * Math.cos(destinationLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function classifyOffice(distanceMeters, radiusMeters, accuracyMeters) {
  if (distanceMeters + accuracyMeters <= radiusMeters) {
    return 'INSIDE';
  }
  if (distanceMeters - accuracyMeters > radiusMeters) {
    return 'OUTSIDE';
  }
  return null;
}

function updatePresenceFromLocation(store, body) {
  if (!store.office) {
    return null;
  }
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  const accuracy = Number(body.accuracy);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(accuracy)) {
    return null;
  }
  const distanceMeters = haversineMeters(store.office, {latitude, longitude});
  const next = classifyOffice(distanceMeters, store.office.radiusMeters, accuracy);
  if (next) {
    store.presence = next;
  }
  return distanceMeters;
}

function handleRequest(store, request) {
  const method = request.method || 'GET';
  const path = request.path || '/';
  if (method === 'GET' && path === '/health') {
    return json(200, {ok: true});
  }
  if (method === 'GET' && path === '/api/office') {
    return json(200, {office: store.office, presence: store.presence});
  }
  if (method !== 'POST') {
    return json(404, {error: 'Not found'});
  }

  const invalid = requireObject(request.body);
  if (invalid) {
    return json(400, {error: invalid});
  }

  if (path === '/api/office') {
    const latitude = Number(request.body.latitude);
    const longitude = Number(request.body.longitude);
    const radiusMeters = Number(request.body.radiusMeters);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !(radiusMeters > 0)) {
      return json(400, {error: 'latitude, longitude, and radiusMeters are required'});
    }
    const anchoredAt = receivedAt();
    store.office = {
      id: 'office',
      latitude,
      longitude,
      radiusMeters,
      anchoredAt,
    };
    store.presence = 'INSIDE';
    return json(200, {receivedAt: anchoredAt, office: store.office, presence: store.presence});
  }

  if (path === '/api/locations') {
    const item = {...request.body, receivedAt: receivedAt()};
    store.locations.push(item);
    const distanceMeters = updatePresenceFromLocation(store, request.body);
    return json(200, {
      receivedAt: item.receivedAt,
      presence: store.presence,
      distanceMeters,
    });
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
    if (request.body.eventType === 'EXIT') {
      store.presence = 'OUTSIDE';
    } else if (request.body.eventType === 'ENTER') {
      store.presence = 'INSIDE';
    }
    return json(200, {
      receivedAt: stored.receivedAt,
      duplicate: false,
      presence: store.presence,
    });
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
