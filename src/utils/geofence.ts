import type {GeofenceEventType, Presence} from '../types';

export const MAX_ACCURACY_METERS = 50;
export const GEOFENCE_CONFIRMATIONS_REQUIRED = 2;

export interface FenceSample {
  distanceMeters: number;
  accuracyMeters: number;
}

export interface FenceEvaluationOptions {
  radiusMeters: number;
  maxAccuracyMeters?: number;
  confirmationsRequired?: number;
}

export interface FenceMemory {
  presence: Presence | 'unknown';
  pendingPresence: Presence | null;
  pendingCount: number;
}

export interface FenceEvaluation {
  next: FenceMemory;
  transition: GeofenceEventType | null;
  ignoredReason?: 'poor-accuracy' | 'invalid-sample';
}

export function createFenceMemory(): FenceMemory {
  return {
    presence: 'unknown',
    pendingPresence: null,
    pendingCount: 0,
  };
}

export function isAccuracyAcceptable(
  accuracyMeters: number,
  maxAccuracyMeters: number = MAX_ACCURACY_METERS,
): boolean {
  return Number.isFinite(accuracyMeters) && accuracyMeters >= 0 && accuracyMeters <= maxAccuracyMeters;
}

/**
 * A fix counts as inside only when the whole accuracy circle is inside the
 * fence, and outside only when the whole circle is outside. The band between
 * those checks absorbs GPS drift at the boundary.
 */
export function classifyPresence(
  distanceMeters: number,
  radiusMeters: number,
  accuracyMeters: number,
): Presence | 'ambiguous' {
  if (distanceMeters + accuracyMeters <= radiusMeters) {
    return 'inside';
  }
  if (distanceMeters - accuracyMeters > radiusMeters) {
    return 'outside';
  }
  return 'ambiguous';
}

function transitionFor(
  previous: Presence | 'unknown',
  next: Presence,
): GeofenceEventType | null {
  if (previous === 'outside' && next === 'inside') {
    return 'ENTER';
  }
  if (previous === 'inside' && next === 'outside') {
    return 'EXIT';
  }
  return null;
}

export function evaluateGeofenceTransition(
  sample: FenceSample,
  previous: FenceMemory,
  options: FenceEvaluationOptions,
): FenceEvaluation {
  const maxAccuracyMeters = options.maxAccuracyMeters ?? MAX_ACCURACY_METERS;
  const confirmationsRequired = options.confirmationsRequired ?? GEOFENCE_CONFIRMATIONS_REQUIRED;

  const accuracyAcceptable = isAccuracyAcceptable(
    sample.accuracyMeters,
    maxAccuracyMeters,
  );
  const distanceAcceptable =
    Number.isFinite(sample.distanceMeters) && sample.distanceMeters >= 0;
  if (!distanceAcceptable || !accuracyAcceptable) {
    return {
      next: previous,
      transition: null,
      ignoredReason: accuracyAcceptable ? 'invalid-sample' : 'poor-accuracy',
    };
  }

  const candidate = classifyPresence(
    sample.distanceMeters,
    options.radiusMeters,
    sample.accuracyMeters,
  );

  if (candidate === 'ambiguous') {
    return {
      next: {
        ...previous,
        pendingPresence: null,
        pendingCount: 0,
      },
      transition: null,
    };
  }

  if (previous.presence === candidate) {
    return {
      next: {
        presence: candidate,
        pendingPresence: null,
        pendingCount: 0,
      },
      transition: null,
    };
  }

  const pendingCount =
    previous.pendingPresence === candidate ? previous.pendingCount + 1 : 1;

  if (pendingCount < confirmationsRequired) {
    return {
      next: {
        presence: previous.presence,
        pendingPresence: candidate,
        pendingCount,
      },
      transition: null,
    };
  }

  return {
    next: {
      presence: candidate,
      pendingPresence: null,
      pendingCount: 0,
    },
    transition: transitionFor(previous.presence, candidate),
  };
}
