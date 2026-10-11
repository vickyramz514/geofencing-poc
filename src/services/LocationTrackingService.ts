import type {LocationErrorCode, LocationFix} from '../types';
import {LocationTrackingError} from '../types';

export interface WatchOptions {
  enableHighAccuracy: boolean;
  distanceFilter: number;
  interval: number;
  fastestInterval: number;
  timeout: number;
  maximumAge: number;
}

export interface LocationProvider {
  requestAuthorization(): Promise<'granted' | 'denied' | 'restricted'>;
  watchPosition(
    success: (fix: LocationFix) => void,
    error: (error: LocationTrackingError) => void,
    options: WatchOptions,
  ): number;
  clearWatch(watchId: number): void;
}

const WATCH_OPTIONS: WatchOptions = {
  enableHighAccuracy: true,
  distanceFilter: 0,
  interval: 5000,
  fastestInterval: 2000,
  timeout: 20000,
  maximumAge: 1000,
};

export class LocationTrackingService {
  private watchId: number | null = null;
  private running = false;
  private starting = false;
  private stopRequested = false;
  private readonly listeners = new Set<(fix: LocationFix) => void>();
  private readonly errorListeners = new Set<(error: LocationTrackingError) => void>();

  constructor(private readonly provider: LocationProvider) {}

  get isTracking(): boolean {
    return this.running;
  }

  subscribe(listener: (fix: LocationFix) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeErrors(listener: (error: LocationTrackingError) => void): () => void {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  async start(): Promise<void> {
    if (this.running || this.starting || this.watchId != null) {
      return;
    }

    this.starting = true;
    this.stopRequested = false;
    try {
      const authorization = await this.provider.requestAuthorization();
      if (authorization === 'denied') {
        throw new LocationTrackingError(
          'Location permission was denied. Enable location access for GeoFencePOC in system settings, then start tracking again.',
          'permission-denied',
        );
      }
      if (authorization === 'restricted') {
        throw new LocationTrackingError(
          'Location access is restricted on this device.',
          'permission-restricted',
        );
      }
      if (this.stopRequested || this.watchId != null) {
        return;
      }

      this.watchId = this.provider.watchPosition(
        fix => {
          if (!this.running) {
            return;
          }
          this.listeners.forEach(listener => listener(fix));
        },
        error => {
          if (error.code === 'permission-denied' || error.code === 'gps-disabled') {
            this.stop();
          }
          this.errorListeners.forEach(listener => listener(error));
        },
        WATCH_OPTIONS,
      );
      this.running = true;
    } finally {
      this.starting = false;
    }
  }

  stop(): void {
    this.stopRequested = true;
    this.running = false;
    if (this.watchId != null) {
      this.provider.clearWatch(this.watchId);
      this.watchId = null;
    }
  }
}

export function locationErrorFromCode(
  code: number,
  fallbackMessage: string,
): LocationTrackingError {
  const mapped: Record<number, {code: LocationErrorCode; message: string}> = {
    1: {
      code: 'permission-denied',
      message:
        'Location permission was denied. Enable location access for GeoFencePOC in system settings, then start tracking again.',
    },
    2: {
      code: 'gps-disabled',
      message: 'GPS is turned off. Enable location services and start tracking again.',
    },
    3: {
      code: 'timeout',
      message: 'The GPS request timed out. Tracking will keep trying.',
    },
  };
  const match = mapped[code];
  if (!match) {
    return new LocationTrackingError(fallbackMessage || 'Location tracking failed.', 'unknown');
  }
  return new LocationTrackingError(match.message, match.code);
}
