export function formatCoordinate(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return 'Unavailable';
  }
  return value.toFixed(6);
}

export function formatAccuracy(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(meters)) {
    return 'Unavailable';
  }
  return `${Math.round(meters)} m`;
}

export function formatDistance(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(meters)) {
    return 'Distance unavailable';
  }
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatHeading(heading: number | null | undefined): string {
  if (heading == null || !Number.isFinite(heading) || heading < 0) {
    return 'Unavailable';
  }
  return `${Math.round(heading)}°`;
}

export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) {
    return 'No successful update yet';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 'No successful update yet';
  }
  return date.toLocaleString();
}
