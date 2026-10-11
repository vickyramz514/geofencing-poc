import type {
  GeofenceRegion,
  GeofenceTransition,
  LocationFix,
  MonitoringStatus,
  Presence,
} from '../types';
import {haversineDistanceMeters} from '../utils/distance';
import {
  createFenceMemory,
  evaluateGeofenceTransition,
  type FenceMemory,
} from '../utils/geofence';

export interface ProcessLocationResult {
  transitions: GeofenceTransition[];
  accepted: boolean;
}

export interface GeofencingService {
  registerGeofence(region: GeofenceRegion, initialPresence?: Presence | 'unknown'): void;
  removeGeofence(schoolId: string): void;
  registerSchools(regions: GeofenceRegion[]): void;
  onTransition(listener: (transition: GeofenceTransition) => void): () => void;
  stop(): void;
  getStatus(): MonitoringStatus;
  processLocation(fix: LocationFix): ProcessLocationResult;
  getPresence(): Record<string, Presence | 'unknown'>;
}

/**
 * Foreground geofencing. Transitions come from GPS fixes and the Haversine
 * helper. Native background monitoring is intentionally not enabled here.
 * See the README for the Android Geofencing API and iOS region-monitoring plan.
 */
export class ForegroundGeofencingService implements GeofencingService {
  private readonly regions = new Map<string, GeofenceRegion>();
  private readonly memory = new Map<string, FenceMemory>();
  private readonly listeners = new Set<(transition: GeofenceTransition) => void>();
  private readonly lastEmitted = new Map<string, GeofenceTransition['eventType']>();
  private active = false;

  registerGeofence(
    region: GeofenceRegion,
    initialPresence: Presence | 'unknown' = 'unknown',
  ): void {
    this.regions.set(region.schoolId, region);
    this.memory.set(region.schoolId, {
      ...createFenceMemory(),
      presence: initialPresence,
    });
    this.lastEmitted.delete(region.schoolId);
    this.active = true;
  }

  removeGeofence(schoolId: string): void {
    this.regions.delete(schoolId);
    this.memory.delete(schoolId);
    this.lastEmitted.delete(schoolId);
    if (this.regions.size === 0) {
      this.active = false;
    }
  }

  registerSchools(regions: GeofenceRegion[]): void {
    this.regions.clear();
    this.memory.clear();
    this.lastEmitted.clear();
    regions.forEach(region => {
      this.regions.set(region.schoolId, region);
      this.memory.set(region.schoolId, createFenceMemory());
    });
    this.active = regions.length > 0;
  }

  onTransition(listener: (transition: GeofenceTransition) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  stop(): void {
    this.active = false;
  }

  getStatus(): MonitoringStatus {
    return {
      active: this.active,
      mode: 'foreground-gps',
      backgroundMonitoring: 'not-enabled',
      schoolIds: [...this.regions.keys()],
    };
  }

  getPresence(): Record<string, Presence | 'unknown'> {
    const presence: Record<string, Presence | 'unknown'> = {};
    this.regions.forEach((_region, schoolId) => {
      presence[schoolId] = this.memory.get(schoolId)?.presence ?? 'unknown';
    });
    return presence;
  }

  processLocation(fix: LocationFix): ProcessLocationResult {
    if (!this.active) {
      return {transitions: [], accepted: false};
    }

    const transitions: GeofenceTransition[] = [];
    let accepted = false;

    this.regions.forEach(region => {
      const distanceMeters = haversineDistanceMeters(fix, region);
      const previous = this.memory.get(region.schoolId) ?? createFenceMemory();
      const evaluation = evaluateGeofenceTransition(
        {distanceMeters, accuracyMeters: fix.accuracy},
        previous,
        {radiusMeters: region.radiusMeters},
      );
      this.memory.set(region.schoolId, evaluation.next);
      if (!evaluation.ignoredReason) {
        accepted = true;
      }
      if (!evaluation.transition) {
        return;
      }
      if (this.lastEmitted.get(region.schoolId) === evaluation.transition) {
        return;
      }
      this.lastEmitted.set(region.schoolId, evaluation.transition);
      const transition: GeofenceTransition = {
        schoolId: region.schoolId,
        eventType: evaluation.transition,
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracy: fix.accuracy,
        timestamp: fix.timestamp,
      };
      transitions.push(transition);
      this.listeners.forEach(listener => listener(transition));
    });

    return {transitions, accepted};
  }
}
