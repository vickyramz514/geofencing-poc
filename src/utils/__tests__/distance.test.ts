import {haversineDistanceMeters} from '../distance';

describe('haversineDistanceMeters', () => {
  it('returns 0 for the same point', () => {
    const point = {latitude: 13.0827, longitude: 80.2707};
    expect(haversineDistanceMeters(point, point)).toBe(0);
  });

  it('calculates one degree of longitude at the equator', () => {
    const distance = haversineDistanceMeters(
      {latitude: 0, longitude: 0},
      {latitude: 0, longitude: 1},
    );
    expect(distance).toBeCloseTo((6371000 * Math.PI) / 180, 3);
  });

  it('is symmetric', () => {
    const origin = {latitude: 13.0827, longitude: 80.2707};
    const destination = {latitude: 13.09, longitude: 80.28};
    expect(haversineDistanceMeters(origin, destination)).toBeCloseTo(
      haversineDistanceMeters(destination, origin),
      6,
    );
  });

  it('grows as the points move apart', () => {
    const origin = {latitude: 13.0827, longitude: 80.2707};
    const near = haversineDistanceMeters(origin, {
      latitude: 13.083,
      longitude: 80.2707,
    });
    const far = haversineDistanceMeters(origin, {
      latitude: 13.09,
      longitude: 80.2707,
    });
    expect(far).toBeGreaterThan(near);
    expect(near).toBeGreaterThan(30);
    expect(near).toBeLessThan(40);
  });

  it('returns NaN for invalid coordinates', () => {
    expect(
      haversineDistanceMeters(
        {latitude: Number.NaN, longitude: 0},
        {latitude: 0, longitude: 0},
      ),
    ).toBeNaN();
  });
});
