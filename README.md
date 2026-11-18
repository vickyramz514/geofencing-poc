# GeoFencePOC

React Native CLI proof of concept for foreground GPS tracking, school geofences, and a multi-school delivery workflow. The app is bare React Native with TypeScript. It does not use Expo.

This workspace was generated with React Native **0.86.3** because the installed Node.js is **20.19.5**. React Native 0.87 requires Node.js 22.13 or newer. The Android template matches the local SDK: compile SDK 36, build tools 36.0.0, and NDK 27.1.12297006. The JDK is 17.

## What the proof of concept does

- Anchors a 200 metre office circle on the device's current location when tracking starts.
- Shows **inside the office area** until the device leaves that circle, then shows **outside**.
- Detects **EXIT** when the device leaves and **ENTER** if it comes back. Opening the app inside the circle does not invent an entry.
- Uploads locations on a movement and time policy, uploads geofence transitions immediately, and queues failed requests until the network returns.
- Registers a named device on first launch, then opens the live map and starts tracking. Location updates include the registered device ID and name.
- Calls the local API in `admin-portal/server/` when `.env` points at it. Mock mode remains available.

Foreground GPS geofencing is covered by unit tests. Native background regions are registered on Android (Play services) and iOS (Core Location). That path is implemented in the app and has **not** been proven on a physical device. See [Foreground and background geofencing](#foreground-and-background-geofencing).

## Requirements

- Node.js `^20.19.4`, `^22.13.0`, `^24.3.0`, or `>= 25`
- JDK 17
- Android SDK 36, build tools 36.0.0, and NDK 27.1.12297006
- Xcode with the iOS platform that ships with the React Native 0.86 template
- CocoaPods 1.16 or newer
- A Google Maps API key for Android map tiles. iOS uses Apple Maps and does not need that key.

## Install

```sh
npm install
cp .env.example .env
```

iOS native dependencies:

```sh
cd ios
bundle install
bundle exec pod install
cd ..
```

## Environment

`.env.example` contains no credentials:

```sh
API_BASE_URL=
USE_MOCK_API=true
```

Leave `API_BASE_URL` empty, or set `USE_MOCK_API=true`, to keep the labelled mock adapter. Set both a base URL and `USE_MOCK_API=false` to call a real server with `fetch`.

This repo includes that server. The checked-in `.env` is local and gitignored; the example above is the mock default. To use the live client:

```sh
npm run server
```

The server listens on `0.0.0.0:8787` and stores requests in gitignored `admin-portal/server/data/store.json`. Point `.env` at it:

```sh
API_BASE_URL=http://192.168.1.24:8787
USE_MOCK_API=false
```

Use the computer's LAN address for a phone on the same Wi-Fi. An Android emulator reaches the host at `http://10.0.2.2:8787`. Replace `API_BASE_URL` if the API lives somewhere else. The three routes below are what the client sends. Repeated geofence posts with the same `eventId` return the original `receivedAt`.

Restart Metro after changing `.env` (`npm start -- --reset-cache`). The Babel plugin inlines these values at build time.

Authentication tokens are not stored in AsyncStorage. If a token is required later, `src/services/SecureStorageService.ts` reads it from the platform keychain and the API client sends it as `Authorization: Bearer`. The offline queue never stores that token.

## Run

```sh
npm start
npm run android
npm run ios
```

Android map tiles need a Google Maps key. Add it to the gitignored `android/local.properties` file (Android Studio also writes `sdk.dir` there):

```properties
GOOGLE_MAPS_API_KEY=your-key-here
```

You can also pass `-PGOOGLE_MAPS_API_KEY=your-key-here`. The manifest reads `${GOOGLE_MAPS_API_KEY}`. An empty value still builds, and the map stays blank until a key is present. Do not commit a production key.

iOS uses `PROVIDER_DEFAULT` (Apple Maps), so no Google key is required. To switch iOS to Google Maps later:

1. Add the Google Maps pod from `react-native-maps` in the Podfile.
2. Call `GMSServices.provideAPIKey` in `AppDelegate.swift` with a key supplied outside source control.
3. Change the iOS map provider to `PROVIDER_GOOGLE`.

Use a device or an emulator image that includes Google Play services for Android fused location. Grant location permission when the app asks. After device registration, the map opens and tracking starts automatically. **Stop Tracking** pauses uploads; **Start Tracking** resumes them.

## Dashboard

`GeoFencingScreen` shows:

- Start and Stop Tracking
- Latitude, longitude, accuracy, and heading when the device reports it
- Last successful API update time
- Network status and pending offline update count
- Tracking status and whether foreground monitoring is active
- School cards, the selected school, and geofence event history
- Loading, permission-denied, error, and empty event states

Selecting a school marker or card shows its address, radius, distance, and delivery status.

## Web admin portal

The separate React and TypeScript admin portal lives in `admin-portal/`. Its views cover overview, a Leaflet/OpenStreetMap live map, school geofence management, devices, geofence events, location history, deliveries, and reports. It refreshes tracking data every 15 seconds and exports CSV reports. The school manager uses `GET /api/admin/schools`, `GET /api/admin/schools/{id}`, `POST /api/admin/schools`, and `PUT /api/admin/schools/{id}` for paginated search, school create/edit, and enable/disable. It supports circle radius configuration and GeoJSON Polygon editing on Leaflet Draw. Device management remains read-only because the admin API has no device inventory; assigned device IDs are displayed from school records. Paginated history screens report the total count returned by the API and export the records currently loaded by its response.

Every browser admin request goes to the same-origin `/proxy/admin/*` endpoint. The Node server forwards it to `ADMIN_API_URL` and adds `Authorization: Bearer ${ADMIN_API_TOKEN}` from its server environment. The token is never read by Vite or included in the browser bundle. Set the same `ADMIN_API_TOKEN` in the upstream API server's `.env` and this proxy server's root `.env`; also set `ADMIN_API_URL` to the API base ending in `/api`, then restart both servers. For Vite development, `admin-portal/.env.example` sets `ADMIN_PROXY_TARGET=http://localhost:8787`; production hosting must route `/proxy/*` through an authenticated trusted proxy to this Node server.

The Live GPS map requests `GET /api/admin/locations/latest`, `GET /api/admin/locations/history`, and `GET /api/admin/locations/{deviceId}`. It supports school/device/status filters, history date ranges and pagination, circles or GeoJSON Polygon/MultiPolygon boundaries, device detail popups, and fit/zoom controls. Grey markers indicate missing GPS time/coordinates or fixes older than five minutes. If the latest/history routes return 404, the portal uses the existing `/api/admin/data` response as a compatibility fallback. The local POC server provides those records from its in-memory store. `DELETE /api/admin/locations/history` clears all stored GPS samples and cached device GPS fields while preserving device registrations, office geofences, and geofence events. The deployed API must implement this DELETE route for the admin portal's Clear location history action to work against production.

Run the API and portal in separate terminals:

```sh
npm run server
cd admin-portal
npm install
npm run dev
```

Open the Vite URL shown in the terminal (usually `http://localhost:5173`). The Vite dev proxy sends `/proxy/*` requests to the Node server; set `ADMIN_PROXY_TARGET` in `admin-portal/.env` only if that server is at a different URL. Do not put `ADMIN_API_TOKEN` in the portal `.env` file.

The portal is separate from the React Native mobile app. Admin API calls use the server-side bearer token proxy, but there is no per-user identity or role-based access in the portal. The API also has no device inventory endpoint. School geofence write operations are available through the admin school routes.

## Location uploads

GPS callbacks are not uploaded one by one.

| Rule | Value |
| --- | --- |
| Minimum movement | 50 metres |
| Minimum interval for a movement upload | 15 seconds |
| Stationary heartbeat | 30 seconds |
| Geofence ENTER or EXIT | Upload immediately |

The uploader allows one location request at a time. The last successful upload time changes only after a successful response. A failed request is stored locally and retried with exponential backoff starting at 1 second and capped at 60 seconds. Pending location uploads pause when tracking stops. Delivery status updates and already detected geofence events can still sync. Duplicate geofence uploads are blocked with the event id, both in memory and in the persisted queue. The geofence request also sends an `Idempotency-Key` header.

## Delivery workflow

Each school on `route-001` has its own status. The next action is always one step:

`PENDING → IN_TRANSIT → ARRIVED → DELIVERED → FITTING_IN_PROGRESS → COMPLETED`

An ENTER event while the school is `IN_TRANSIT` suggests arrival. Confirm arrival, confirm delivery, start fitting, and complete fitting are separate buttons. ENTER never writes `DELIVERED`.

## API contracts

These routes are the client contract. `npm run server` implements them locally. The deployed API must also implement `POST /api/devices/register` and accept `deviceId` and `deviceName` on location updates for registered devices to appear by name in production. Mock mode returns a `receivedAt` timestamp without calling the network.

`POST /api/office`

Sent when tracking starts, using the device's current coordinates. The server stores the circle and sets presence to `INSIDE`. `GET /api/office` returns the stored circle and presence. A later location or `EXIT` event changes presence to `OUTSIDE`.

```json
{
  "latitude": 13.0827,
  "longitude": 80.2707,
  "radiusMeters": 200,
  "anchoredAt": "2026-10-11T05:00:00.000Z"
}
```

`POST /api/devices/register`

Registers or updates the device name and platform. The app keeps a stable device ID locally and registers it before opening the map.

```json
{
  "deviceId": "device-m5abc-1234abcd",
  "deviceName": "Warehouse tablet",
  "platform": "android"
}
```

`POST /api/locations`

```json
{
  "deviceId": "device-m5abc-1234abcd",
  "deviceName": "Warehouse tablet",
  "latitude": 13.0827,
  "longitude": 80.2707,
  "accuracy": 10,
  "timestamp": "2026-10-10T03:30:00.000Z"
}
```

`POST /api/geofence-events`

```json
{
  "eventId": "school-001:ENTER:1690000000000:ab12cd34",
  "schoolId": "school-001",
  "eventType": "ENTER",
  "latitude": 13.0827,
  "longitude": 80.2707,
  "accuracy": 10,
  "eventTime": "2026-10-10T03:30:00.000Z"
}
```

`POST /api/deliveries/{deliveryId}/status`

```json
{
  "schoolId": "school-001",
  "status": "DELIVERED"
}
```

## Geofence rules

Distance uses the Haversine formula and an Earth radius of 6,371,000 metres. A fix is ignored for transitions when accuracy is missing or worse than 50 metres. A point counts as inside only when the whole accuracy circle is inside the radius, and outside only when the whole circle is outside it. The band between those checks is ignored so boundary drift does not flicker. A transition is emitted after two agreeing fixes. The first observation only records inside or outside, so opening the app inside a school does not invent an ENTER. Staying inside does not emit another ENTER.

## Tests

```sh
npm test
npm run typecheck
npm run lint
```

Unit tests cover distance, ENTER and EXIT, duplicate suppression, GPS accuracy, upload throttling, retry backoff, offline sync, and delivery transitions.

## Foreground and background geofencing

Foreground GPS still runs while tracking is on:

- `LocationTrackingService` watches GPS after Start Tracking and clears that watch on Stop Tracking.
- `ForegroundGeofencingService` compares each fix with the registered school circles.
- `getStatus()` on that service still reports `mode: "foreground-gps"` and `backgroundMonitoring: "not-enabled"`. Background state is tracked separately in the dashboard.

Native background regions are registered by Start Tracking and removed by Stop Tracking:

- Android uses Play services `GeofencingClient` (`android/app/src/main/java/com/geofencepoc/geofence/`). The app asks for fine location first, then background location. Regions use ENTER and EXIT, do not fire an initial trigger, and are restored after boot. If JavaScript is not running, the receiver posts `/api/geofence-events` itself and also tries a headless task.
- iOS uses Core Location circular regions (`native/background-geofence`). Start Tracking asks for Always after When In Use. The location background mode is enabled. A `CLLocationManager` is created at launch so a terminated app can receive a region event. If JavaScript is not observing, the coordinator posts the same event.
- Both paths share one event id shape, `schoolId:ENTER|EXIT:timestamp`, and the upload queue. A 60 second deduper drops a second ENTER or EXIT for the same school when GPS and the native region both fire.
- If background permission is denied, foreground GPS continues and the dashboard says so.

`react-native-geolocation-service` was not used. Its last release is from 2022 and it does not ship a New Architecture module. This app uses `@react-native-community/geolocation` 3.4.0 for the foreground watch. Continuous background GPS from that module stays off. Background detection is the native region monitor, not a hidden GPS watch.

This has not been walked on a physical device. An emulator often delays or drops geofence transitions, and the iOS simulator does not reliably deliver region events. A unit test does not prove background delivery.

## Project layout

```text
src/
  components/
  screens/GeoFencingScreen.tsx
  services/
    LocationTrackingService.ts
    nativeLocationProvider.ts
    GeofencingService.ts
    ApiService.ts
    OfflineQueueService.ts
    LocationUploadService.ts
    SecureStorageService.ts
  utils/
  data/office.ts
  types/
```

## Still required on a device

- Rebuild the Android app so the Google Maps key in `android/local.properties` is merged, then confirm tiles, markers, and circles render.
- Run `npm run server` and confirm registration and location posts reach `admin-portal/server/data/store.json`.
- Grant location permission and confirm automatic tracking starts after registration and Stop / Start works against a real GPS fix.
- Walk a 200 metre school circle and confirm one ENTER and one EXIT.
- On Android, allow location all the time, then confirm an ENTER or EXIT with the app swiped away.
- On iOS, choose Always, then confirm a region event with the app closed.
- Confirm the permission-denied and location-services-off messages on both platforms.
