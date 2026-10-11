import {haversineDistanceMeters} from './distance';

export const MIN_MOVEMENT_METERS = 50;
export const MIN_UPLOAD_INTERVAL_MS = 15_000;
export const STATIONARY_HEARTBEAT_MS = 30_000;
export const HEARTBEAT_CHECK_MS = 5_000;

export interface UploadDecisionInput {
  nowMs: number;
  latitude: number;
  longitude: number;
  lastAttemptAtMs: number | null;
  lastLatitude: number | null;
  lastLongitude: number | null;
  inFlight: boolean;
  tracking: boolean;
}

export type UploadDecision =
  | {shouldUpload: false; reason: 'tracking-stopped' | 'in-flight' | 'throttled'}
  | {shouldUpload: true; reason: 'movement' | 'heartbeat' | 'first-fix'};

export function decideLocationUpload(input: UploadDecisionInput): UploadDecision {
  if (!input.tracking) {
    return {shouldUpload: false, reason: 'tracking-stopped'};
  }
  if (input.inFlight) {
    return {shouldUpload: false, reason: 'in-flight'};
  }
  if (
    input.lastAttemptAtMs == null ||
    input.lastLatitude == null ||
    input.lastLongitude == null
  ) {
    return {shouldUpload: true, reason: 'first-fix'};
  }

  const elapsedMs = input.nowMs - input.lastAttemptAtMs;
  const movedMeters = haversineDistanceMeters(
    {latitude: input.lastLatitude, longitude: input.lastLongitude},
    {latitude: input.latitude, longitude: input.longitude},
  );

  if (
    movedMeters >= MIN_MOVEMENT_METERS &&
    elapsedMs >= MIN_UPLOAD_INTERVAL_MS
  ) {
    return {shouldUpload: true, reason: 'movement'};
  }
  if (elapsedMs >= STATIONARY_HEARTBEAT_MS) {
    return {shouldUpload: true, reason: 'heartbeat'};
  }
  return {shouldUpload: false, reason: 'throttled'};
}
