const DEFAULT_BASE_MS = 1_000;
const DEFAULT_MAX_MS = 60_000;

export function backoffDelayMs(
  attempt: number,
  baseMs: number = DEFAULT_BASE_MS,
  maxMs: number = DEFAULT_MAX_MS,
): number {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  const delay = baseMs * 2 ** (safeAttempt - 1);
  return Math.min(maxMs, delay);
}
