/* eslint-env node */
const http = require('http');
const fs = require('fs');
const path = require('path');
const {MAX_BODY_BYTES, createStore, handleRequest} = require('./handlers');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
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

const store = loadStore();

const server = http.createServer((req, res) => {
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
    const result = handleRequest(store, {
      method: req.method,
      path: (req.url || '/').split('?')[0],
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
