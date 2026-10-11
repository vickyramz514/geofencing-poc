const DEFAULT_WINDOW_MS = 60_000;

export interface TransitionDeduper {
  accept(schoolId: string, eventType: string, timestamp: number): boolean;
}

export function createTransitionDeduper(
  windowMs: number = DEFAULT_WINDOW_MS,
): TransitionDeduper {
  const lastAccepted = new Map<string, number>();
  return {
    accept(schoolId, eventType, timestamp) {
      const key = `${schoolId}:${eventType}`;
      const previous = lastAccepted.get(key);
      if (previous != null && Math.abs(timestamp - previous) < windowMs) {
        return false;
      }
      lastAccepted.set(key, timestamp);
      return true;
    },
  };
}
