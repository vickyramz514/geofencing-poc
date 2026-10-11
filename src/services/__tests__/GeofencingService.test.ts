import {ForegroundGeofencingService} from '../GeofencingService';
import type {LocationFix} from '../../types';

function fix(latitude: number, accuracy = 5, timestamp = 1_000): LocationFix {
  return {
    latitude,
    longitude: 0,
    accuracy,
    heading: null,
    timestamp,
  };
}

describe('ForegroundGeofencingService', () => {
  const region = {
    schoolId: 'school-001',
    latitude: 0,
    longitude: 0,
    radiusMeters: 200,
  };

  it('emits one ENTER while inside, then one EXIT, and allows a later re-entry', () => {
    const service = new ForegroundGeofencingService();
    const events: string[] = [];
    service.onTransition(transition => {
      events.push(transition.eventType);
    });
    service.registerSchools([region]);

    const outside = fix(0.003);
    const inside = fix(0.0005);
    service.processLocation(outside);
    service.processLocation({...outside, timestamp: 2_000});
    service.processLocation(inside);
    const entered = service.processLocation({...inside, timestamp: 3_000});
    service.processLocation({...inside, timestamp: 4_000});
    service.processLocation({...inside, timestamp: 5_000});
    service.processLocation(outside);
    service.processLocation({...outside, timestamp: 6_000});
    service.processLocation(inside);
    service.processLocation({...inside, timestamp: 7_000});

    expect(entered.transitions.map(transition => transition.eventType)).toEqual(['ENTER']);
    expect(events).toEqual(['ENTER', 'EXIT', 'ENTER']);
    expect(service.getStatus().backgroundMonitoring).toBe('not-enabled');
  });

  it('ignores poor accuracy and stops emitting after monitoring stops', () => {
    const service = new ForegroundGeofencingService();
    service.registerGeofence(region);
    const poor = service.processLocation(fix(0, 80));
    expect(poor.accepted).toBe(false);
    expect(poor.transitions).toEqual([]);
    expect(service.getPresence()['school-001']).toBe('unknown');

    service.stop();
    const afterStop = service.processLocation(fix(0, 5));
    expect(afterStop.transitions).toEqual([]);
    expect(service.getStatus().active).toBe(false);
  });

  it('removes a school from monitoring', () => {
    const service = new ForegroundGeofencingService();
    service.registerGeofence(region);
    service.removeGeofence(region.schoolId);
    expect(service.getStatus().schoolIds).toEqual([]);
    expect(service.getStatus().active).toBe(false);
  });
});
