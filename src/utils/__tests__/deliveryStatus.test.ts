import {
  applyDeliveryTransition,
  canTransition,
  nextDeliveryStatus,
  suggestArrival,
} from '../deliveryStatus';
import type {DeliveryStatus} from '../../types';

const FLOW: DeliveryStatus[] = [
  'PENDING',
  'IN_TRANSIT',
  'ARRIVED',
  'DELIVERED',
  'FITTING_IN_PROGRESS',
  'COMPLETED',
];

describe('delivery status transitions', () => {
  it('allows only the next status in the workflow', () => {
    FLOW.slice(0, -1).forEach((status, index) => {
      const next = FLOW[index + 1];
      expect(nextDeliveryStatus(status)).toBe(next);
      expect(canTransition(status, next)).toBe(true);
      expect(applyDeliveryTransition(status, next)).toBe(next);
    });
    expect(nextDeliveryStatus('COMPLETED')).toBeNull();
  });

  it('rejects skipping from pending to delivered', () => {
    expect(canTransition('PENDING', 'DELIVERED')).toBe(false);
    expect(() => applyDeliveryTransition('PENDING', 'DELIVERED')).toThrow(
      'Cannot change delivery status from PENDING to DELIVERED',
    );
  });

  it('suggests arrival from in transit and never suggests delivered', () => {
    expect(suggestArrival('IN_TRANSIT')).toBe('ARRIVED');
    expect(suggestArrival('PENDING')).toBeNull();
    expect(suggestArrival('ARRIVED')).toBeNull();
    expect(suggestArrival('DELIVERED')).toBeNull();
    FLOW.forEach(status => {
      expect(suggestArrival(status)).not.toBe('DELIVERED');
    });
  });
});
