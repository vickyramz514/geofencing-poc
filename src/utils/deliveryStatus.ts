import type {DeliveryStatus} from '../types';

export const DELIVERY_STATUSES: DeliveryStatus[] = [
  'PENDING',
  'IN_TRANSIT',
  'ARRIVED',
  'DELIVERED',
  'FITTING_IN_PROGRESS',
  'COMPLETED',
];

export const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  PENDING: 'Pending',
  IN_TRANSIT: 'In transit',
  ARRIVED: 'Arrived',
  DELIVERED: 'Delivered',
  FITTING_IN_PROGRESS: 'Fitting in progress',
  COMPLETED: 'Completed',
};

export function canTransition(from: DeliveryStatus, to: DeliveryStatus): boolean {
  return DELIVERY_STATUSES.indexOf(to) === DELIVERY_STATUSES.indexOf(from) + 1;
}

export function nextDeliveryStatus(from: DeliveryStatus): DeliveryStatus | null {
  const index = DELIVERY_STATUSES.indexOf(from);
  return DELIVERY_STATUSES[index + 1] ?? null;
}

export function applyDeliveryTransition(
  from: DeliveryStatus,
  to: DeliveryStatus,
): DeliveryStatus {
  if (!canTransition(from, to)) {
    throw new Error(`Cannot change delivery status from ${from} to ${to}`);
  }
  return to;
}

/**
 * Geofence entry may suggest arrival. It never advances the order to delivered.
 */
export function suggestArrival(status: DeliveryStatus): 'ARRIVED' | null {
  return status === 'IN_TRANSIT' ? 'ARRIVED' : null;
}
