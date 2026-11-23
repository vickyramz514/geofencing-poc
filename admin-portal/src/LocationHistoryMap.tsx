import { useEffect, useMemo, useState } from 'react';
import { latLngBounds, type LatLngTuple } from 'leaflet';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import type { LocationRecord } from './api';

type Sample = { record: LocationRecord; position: LatLngTuple };
type Trail = { label: string; color: string; samples: Sample[] };
const colors = ['#155ccc', '#08795c', '#a33b80', '#b34f12', '#5844b3', '#a13533'];

export function LocationHistoryMap({ records }: { records: LocationRecord[] }) {
  const [fitRequest, setFitRequest] = useState(0);
  const { trails, positions } = useMemo(() => {
    const groups = new Map<string, Trail>();
    const positions: LatLngTuple[] = [];
    for (const [index, record] of records.entries()) {
      const { latitude, longitude } = record;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
          Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;
      const position: LatLngTuple = [latitude, longitude];
      positions.push(position);
      const key = record.deviceId ? `truck:${record.deviceId}` : `sample:${index}`;
      let trail = groups.get(key);
      if (!trail) {
        trail = {
          label: record.deviceName || record.deviceId || 'Unknown truck',
          color: colors[groups.size % colors.length],
          samples: [],
        };
        groups.set(key, trail);
      }
      trail.samples.push({ record, position });
    }
    for (const trail of groups.values()) {
      trail.samples.sort((a, b) =>
        (Date.parse(a.record.timestamp ?? '') || 0) - (Date.parse(b.record.timestamp ?? '') || 0));
    }
    return { trails: [...groups.entries()], positions };
  }, [records]);

  if (!positions.length) {
    return <p className="history-map-empty">No valid GPS coordinates on this page.</p>;
  }

  return (
    <section className="history-map-section" aria-label="Truck location history map">
      <div className="history-map-heading">
        <div>
          <h3>Truck GPS trails</h3>
          <p>{positions.length} GPS {positions.length === 1 ? 'sample' : 'samples'} on this page</p>
        </div>
        <button className="button secondary" onClick={() => setFitRequest(value => value + 1)}>Fit to samples</button>
      </div>
      <div className="history-map-frame">
        <MapContainer center={positions[0]} zoom={15} scrollWheelZoom={false} className="leaflet-map">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitSamples positions={positions} request={fitRequest} />
          {trails.filter(([, trail]) => trail.samples.length > 1).map(([key, trail]) => (
            <Polyline key={key} positions={trail.samples.map(sample => sample.position)}
              pathOptions={{ color: trail.color, weight: 4, opacity: 0.85, interactive: false }} />
          ))}
          {trails.flatMap(([key, trail]) => trail.samples.map(({ record, position }, index) => {
            const endpoint = index === 0 || index === trail.samples.length - 1;
            const accuracy = record.accuracy ?? record.accuracyMeters;
            return (
              <CircleMarker key={`${key}-${index}`} center={position} radius={endpoint ? 7 : 4}
                pathOptions={{ color: '#fff', fillColor: trail.color, fillOpacity: 1, weight: 2 }}>
                <Popup>
                  <strong>{trail.label}</strong>
                  <br />{record.timestamp ? new Date(record.timestamp).toLocaleString() : 'Time unavailable'}
                  <br />{position[0].toFixed(5)}, {position[1].toFixed(5)}
                  {accuracy != null && <><br />GPS accuracy ±{accuracy} m</>}
                </Popup>
              </CircleMarker>
            );
          }))}
        </MapContainer>
      </div>
      <ul className="history-map-legend" aria-label="Trucks shown on the map">
        {trails.map(([key, trail]) => (
          <li key={key}><i style={{ backgroundColor: trail.color }} />{trail.label}</li>
        ))}
      </ul>
    </section>
  );
}

function FitSamples({ positions, request }: { positions: LatLngTuple[]; request: number }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(latLngBounds(positions), { padding: [32, 32], maxZoom: 16 });
  }, [map, positions, request]);
  return null;
}
