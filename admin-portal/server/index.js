/* eslint-env node */
const http = require('http');
const fs = require('fs');
const path = require('path');
const {MAX_BODY_BYTES, createStore, handleRequest} = require('./handlers');

function loadServerEnv(file) {
  try {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const separator = trimmed.indexOf('=');
      if (separator < 1) return;
      const key = trimmed.slice(0, separator).trim();
      if (process.env[key] !== undefined) return;
      let value = trimmed.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    });
  } catch {
    // The server can also receive configuration from its process environment.
  }
}

loadServerEnv(path.join(__dirname, '..', '.env'));

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const ADMIN_API_URL = (process.env.ADMIN_API_URL || '').replace(/\/$/, '');
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN || '';
const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'store.json');

function loadStore() {
  const store = createStore();
  try {
    const raw = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    store.locations = Array.isArray(raw.locations) ? raw.locations : [];
    store.deliveries = Array.isArray(raw.deliveries) ? raw.deliveries : [];
    store.office = raw.office && typeof raw.office === 'object' ? raw.office : null;
    store.presence = raw.presence === 'INSIDE' || raw.presence === 'OUTSIDE' ? raw.presence : 'UNKNOWN';
    const events = Array.isArray(raw.events) ? raw.events : [];
    events.forEach(event => {
      if (event && event.eventId) {
        store.events.set(event.eventId, event);
      }
    });
  } catch {
    // A missing file means this is the first run.
  }
  return store;
}

function saveStore(store) {
  fs.mkdirSync(dataDir, {recursive: true});
  fs.writeFileSync(
    dataFile,
    JSON.stringify(
      {
        locations: store.locations,
        deliveries: store.deliveries,
        events: [...store.events.values()],
        office: store.office,
        presence: store.presence,
      },
      null,
      2,
    ),
  );
}

async function proxyAdminRequest(req, res, requestUrl, body) {
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method || 'GET')) {
    res.writeHead(405, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    res.end(JSON.stringify({error: 'Method not allowed'}));
    return;
  }
  if (!ADMIN_API_URL || !ADMIN_API_TOKEN) {
    res.writeHead(503, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    res.end(JSON.stringify({error: 'Admin API proxy is not configured on the server.'}));
    return;
  }
  let target;
  try {
    const configuredBase = new URL(ADMIN_API_URL);
    if (!['http:', 'https:'].includes(configuredBase.protocol)) throw new Error('Unsupported protocol');
    const incoming = new URL(requestUrl, 'http://localhost');
    const suffix = incoming.pathname.slice('/proxy/admin'.length);
    target = `${ADMIN_API_URL}/admin${suffix}${incoming.search}`;
  } catch {
    res.writeHead(500, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    res.end(JSON.stringify({error: 'Admin API proxy URL is invalid.'}));
    return;
  }

  const headers = {
    Accept: req.headers.accept || 'application/json',
    Authorization: `Bearer ${ADMIN_API_TOKEN}`,
  };
  if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
  if (req.headers['idempotency-key']) headers['Idempotency-Key'] = req.headers['idempotency-key'];
  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method || '') ? undefined : body,
      signal: AbortSignal.timeout(30_000),
    });
    const responseBody = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-store',
    });
    res.end(responseBody);
  } catch {
    res.writeHead(502, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    res.end(JSON.stringify({error: 'Could not reach the admin API.'}));
  }
}

const store = loadStore();

const server = http.createServer((req, res) => {
  const pathname = (req.url || '/').split('?')[0];
  res.setHeader('Access-Control-Allow-Origin', process.env.ADMIN_ORIGIN || 'http://localhost:5173');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  const chunks = [];
  let size = 0;
  req.on('data', chunk => {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      res.writeHead(413, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: 'Body too large'}));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    let body = {};
    const raw = Buffer.concat(chunks).toString('utf8');
    if (raw.length > 0) {
      try {
        body = JSON.parse(raw);
      } catch {
        res.writeHead(400, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({error: 'Invalid JSON'}));
        return;
      }
    }
    const headers = {};
    Object.entries(req.headers).forEach(([key, value]) => {
      headers[key.toLowerCase()] = Array.isArray(value) ? value.join(',') : value || '';
    });
    if (pathname === '/proxy/admin' || pathname.startsWith('/proxy/admin/')) {
      void proxyAdminRequest(req, res, req.url || pathname, raw);
      return;
    }
    const result = handleRequest(store, {
      method: req.method,
      path: pathname,
      headers,
      body,
    });
    saveStore(store);
    res.writeHead(result.status, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(result.body));
  });
});

server.listen(PORT, HOST, () => {
  console.log(`GeoFence API listening on http://${HOST}:${PORT}`);
});
