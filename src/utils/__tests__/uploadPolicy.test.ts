import {decideLocationUpload} from '../uploadPolicy';

const base = {
  nowMs: 100_000,
  latitude: 13.0827,
  longitude: 80.2707,
  lastAttemptAtMs: 100_000,
  lastLatitude: 13.0827,
  lastLongitude: 80.2707,
  inFlight: false,
  tracking: true,
};

describe('decideLocationUpload', () => {
  it('uploads the first fix', () => {
    expect(
      decideLocationUpload({
        ...base,
        lastAttemptAtMs: null,
        lastLatitude: null,
        lastLongitude: null,
      }),
    ).toEqual({shouldUpload: true, reason: 'first-fix'});
  });

  it('waits for both 50 metres and 15 seconds before a movement upload', () => {
    expect(
      decideLocationUpload({
        ...base,
        nowMs: base.nowMs + 16_000,
        latitude: 13.083,
      }).shouldUpload,
    ).toBe(false);

    expect(
      decideLocationUpload({
        ...base,
        nowMs: base.nowMs + 10_000,
        latitude: 13.09,
      }),
    ).toEqual({shouldUpload: false, reason: 'throttled'});

    expect(
      decideLocationUpload({
        ...base,
        nowMs: base.nowMs + 15_000,
        latitude: 13.09,
      }),
    ).toEqual({shouldUpload: true, reason: 'movement'});
  });

  it('sends a stationary heartbeat after 30 seconds', () => {
    expect(
      decideLocationUpload({
        ...base,
        nowMs: base.nowMs + 29_000,
      }),
    ).toEqual({shouldUpload: false, reason: 'throttled'});

    expect(
      decideLocationUpload({
        ...base,
        nowMs: base.nowMs + 30_000,
      }),
    ).toEqual({shouldUpload: true, reason: 'heartbeat'});
  });

  it('blocks an upload that is already in flight or after tracking stops', () => {
    expect(decideLocationUpload({...base, inFlight: true})).toEqual({
      shouldUpload: false,
      reason: 'in-flight',
    });
    expect(decideLocationUpload({...base, tracking: false})).toEqual({
      shouldUpload: false,
      reason: 'tracking-stopped',
    });
  });
});
