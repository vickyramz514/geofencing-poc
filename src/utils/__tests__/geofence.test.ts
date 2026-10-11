import {
  createFenceMemory,
  evaluateGeofenceTransition,
  isAccuracyAcceptable,
  type FenceMemory,
} from '../geofence';

const OPTIONS = {radiusMeters: 200, maxAccuracyMeters: 50, confirmationsRequired: 2};

function step(distanceMeters: number, accuracyMeters: number, previous: FenceMemory) {
  return evaluateGeofenceTransition(
    {distanceMeters, accuracyMeters},
    previous,
    OPTIONS,
  );
}

describe('geofence transitions', () => {
  it('rejects poor GPS accuracy without changing state', () => {
    const seeded = step(300, 10, step(300, 10, createFenceMemory()).next).next;
    expect(seeded.presence).toBe('outside');

    const rejected = step(0, 80, seeded);
    expect(rejected.transition).toBeNull();
    expect(rejected.ignoredReason).toBe('poor-accuracy');
    expect(rejected.next).toEqual(seeded);
    expect(isAccuracyAcceptable(50)).toBe(true);
    expect(isAccuracyAcceptable(50.1)).toBe(false);
  });

  it('emits ENTER only after an outside-to-inside transition is confirmed', () => {
    let state = createFenceMemory();
    state = step(300, 10, state).next;
    state = step(300, 10, state).next;
    expect(state.presence).toBe('outside');

    const pending = step(100, 10, state);
    expect(pending.transition).toBeNull();
    expect(pending.next.presence).toBe('outside');

    const entered = step(100, 10, pending.next);
    expect(entered.transition).toBe('ENTER');
    expect(entered.next.presence).toBe('inside');
  });

  it('does not emit another ENTER while the device stays inside', () => {
    let state = createFenceMemory();
    state = step(300, 10, state).next;
    state = step(300, 10, state).next;
    state = step(100, 10, state).next;
    state = step(100, 10, state).next;

    const stillInside = [40, 80, 120, 150].map(distance => {
      const result = step(distance, 10, state);
      state = result.next;
      return result.transition;
    });

    expect(stillInside).toEqual([null, null, null, null]);
    expect(state.presence).toBe('inside');
  });

  it('emits EXIT only after an inside-to-outside transition is confirmed', () => {
    let state = createFenceMemory();
    state = step(100, 10, state).next;
    state = step(100, 10, state).next;
    expect(state.presence).toBe('inside');

    const pending = step(400, 10, state);
    expect(pending.transition).toBeNull();
    const exited = step(400, 10, pending.next);
    expect(exited.transition).toBe('EXIT');
    expect(exited.next.presence).toBe('outside');

    const stillOutside = step(450, 10, exited.next);
    expect(stillOutside.transition).toBeNull();
  });

  it('ignores boundary samples that sit inside the accuracy band', () => {
    let state = createFenceMemory();
    state = step(300, 10, state).next;
    state = step(300, 10, state).next;

    const ambiguous = step(200, 10, state);
    expect(ambiguous.transition).toBeNull();
    expect(ambiguous.next.presence).toBe('outside');
    expect(ambiguous.next.pendingCount).toBe(0);
  });
});
