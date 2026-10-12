export const OFFICE_ID = 'office';
export const OFFICE_RADIUS_METERS = 100;
export const OFFICE_NAME = 'Office area';

/** Selectable fence sizes, 50 m through 1000 m. */
export const OFFICE_RADIUS_OPTIONS = Array.from({length: 20}, (_, index) => 50 * (index + 1));
