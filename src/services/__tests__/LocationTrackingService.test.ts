import {LocationTrackingService, type LocationProvider} from '../LocationTrackingService';
import {LocationTrackingError, type LocationFix} from '../../types';

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>(next => {
    resolve = next;
  });
  return {promise, resolve};
}

function createHarness(authorization: LocationProvider['requestAuthorization']) {
  let success: ((fix: LocationFix) => void) | null = null;
  const provider: LocationProvider = {
    requestAuthorization: authorization,
    watchPosition: jest.fn(onSuccess => {
      success = onSuccess;
      return 7;
    }),
    clearWatch: jest.fn(),
  };
  return {
    provider,
    service: new LocationTrackingService(provider),
    emit(fix: LocationFix) {
      success?.(fix);
    },
  };
}

const fix: LocationFix = {
  latitude: 13,
  longitude: 80,
  accuracy: 5,
  heading: 90,
  timestamp: 1,
};

describe('LocationTrackingService', () => {
  it('starts one watcher and ignores a second start', async () => {
    const pending = deferred<'granted'>();
    const {provider, service} = createHarness(() => pending.promise);
    const first = service.start();
    const second = service.start();
    expect(provider.watchPosition).not.toHaveBeenCalled();
    pending.resolve('granted');
    await Promise.all([first, second]);
    expect(provider.watchPosition).toHaveBeenCalledTimes(1);
    expect(service.isTracking).toBe(true);
  });

  it('does not watch when permission is denied', async () => {
    const {provider, service} = createHarness(async () => 'denied');
    await expect(service.start()).rejects.toBeInstanceOf(LocationTrackingError);
    expect(provider.watchPosition).not.toHaveBeenCalled();
    expect(service.isTracking).toBe(false);
  });

  it('clears the watcher and drops fixes received after stop', async () => {
    const {provider, service, emit} = createHarness(async () => 'granted');
    const listener = jest.fn();
    service.subscribe(listener);
    await service.start();
    emit(fix);
    expect(listener).toHaveBeenCalledWith(fix);
    service.stop();
    emit(fix);
    expect(provider.clearWatch).toHaveBeenCalledWith(7);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(service.isTracking).toBe(false);
  });
});
