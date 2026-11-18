import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import NetInfo from '@react-native-community/netinfo';
import {OFFICE_ID, OFFICE_RADIUS_METERS} from '../data/office';
import {createAppServices, type AppServices} from '../services/createAppServices';
import {requestBackgroundLocation} from '../services/nativeLocationProvider';
import {
  backgroundPermissionCopy,
  backgroundPlatformLabel,
  drainPendingBackgroundEvents,
  markBackgroundEventUploaded,
  requestGeofenceNotificationPermission,
  showGeofenceNotification,
  startBackgroundMonitoring,
  stopBackgroundMonitoring,
  subscribeBackgroundTransitions,
  toGeofenceEvent,
  type NativeGeofenceEvent,
} from '../services/nativeBackgroundGeofence';
import {createTransitionDeduper, type TransitionDeduper} from '../utils/transitionDeduper';
import type {
  GeofenceEvent,
  GeofenceRegion,
  GeofenceTransition,
  LocationFix,
  LocationTrackingError,
  Presence,
  TrackingStatus,
} from '../types';
import {haversineDistanceMeters} from '../utils/distance';

function createEvent(transition: GeofenceTransition): GeofenceEvent {
  return {
    eventId: `${transition.schoolId}:${transition.eventType}:${transition.timestamp}:${Math.random()
      .toString(36)
      .slice(2, 10)}`,
    schoolId: transition.schoolId,
    eventType: transition.eventType,
    latitude: transition.latitude,
    longitude: transition.longitude,
    accuracy: transition.accuracy,
    eventTime: new Date(transition.timestamp).toISOString(),
    serverReceivedAt: null,
    uploadStatus: 'pending',
  };
}

function isOnlineState(state: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}): boolean {
  return Boolean(state.isConnected) && state.isInternetReachable !== false;
}

function settle(work: Promise<unknown>): void {
  work.catch(() => undefined);
}

export function useDeliveryTracking(device: {deviceId: string; deviceName: string}) {
  const servicesRef = useRef<AppServices | null>(null);
  if (servicesRef.current == null) {
    servicesRef.current = createAppServices();
  }
  const services = servicesRef.current;
  const subscriptionsRef = useRef<Array<() => void>>([]);
  const deduperRef = useRef<TransitionDeduper>(createTransitionDeduper());
  const officeRef = useRef<GeofenceRegion | null>(null);
  const locationRef = useRef<LocationFix | null>(null);
  const radiusRef = useRef(OFFICE_RADIUS_METERS);
  const backgroundPermissionRef = useRef<'granted' | 'denied'>('denied');

  const [trackingStatus, setTrackingStatus] = useState<TrackingStatus>('idle');
  const [location, setLocation] = useState<LocationFix | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSuccessAt, setLastSuccessAt] = useState<string | null>(null);
  const [events, setEvents] = useState<GeofenceEvent[]>([]);
  const [radiusMeters, setRadiusMetersState] = useState(OFFICE_RADIUS_METERS);
  const [office, setOffice] = useState<GeofenceRegion | null>(null);
  const [officeName, setOfficeName] = useState<string | null>(null);
  const [officePresence, setOfficePresence] = useState<Presence | 'unknown'>('unknown');
  const [accuracyAccepted, setAccuracyAccepted] = useState(true);
  const [backgroundActive, setBackgroundActive] = useState(false);

  const refreshPending = useCallback(async () => {
    const count = await servicesRef.current!.queue.count();
    setPendingCount(count);
  }, []);

  const clearSubscriptions = useCallback(() => {
    subscriptionsRef.current.forEach(unsubscribe => unsubscribe());
    subscriptionsRef.current = [];
  }, []);

  useEffect(() => {
    services.upload.setDevice(device);
  }, [device.deviceId, device.deviceName, services.upload]);

  useEffect(() => {
    const upload = services.upload;
    const unsubscribe = upload.subscribe(event => {
      if (event.type === 'location-uploaded') {
        setLastSuccessAt(event.receivedAt);
      }
      if (event.type === 'geofence-uploaded') {
        setEvents(current =>
          current.map(item =>
            item.eventId === event.eventId
              ? {
                  ...item,
                  uploadStatus: 'uploaded',
                  serverReceivedAt: event.receivedAt,
                }
              : item,
          ),
        );
      }
      settle(refreshPending());
    });
    settle(refreshPending());
    return unsubscribe;
  }, [refreshPending, services.upload]);

  useEffect(() => {
    const apply = (state: {
      isConnected: boolean | null;
      isInternetReachable: boolean | null;
    }) => {
      const online = isOnlineState(state);
      setIsOnline(online);
      services.upload.setOnline(online);
      if (online) {
        settle(
          services.upload.flush().finally(() => {
            settle(refreshPending());
          }),
        );
      }
    };
    const unsubscribe = NetInfo.addEventListener(apply);
    settle(NetInfo.fetch().then(apply));
    return unsubscribe;
  }, [refreshPending, services.upload]);

  useEffect(() => {
    return () => {
      clearSubscriptions();
      services.location.stop();
      services.geofencing.stop();
      services.upload.dispose();
      settle(stopBackgroundMonitoring());
    };
  }, [clearSubscriptions, services]);

  const publishEvent = useCallback(
    (event: GeofenceEvent) => {
      setEvents(current => [event, ...current].slice(0, 100));
      if (event.schoolId === (officeRef.current?.schoolId ?? OFFICE_ID)) {
        setOfficePresence(event.eventType === 'EXIT' ? 'outside' : 'inside');
        showGeofenceNotification(event.eventType, event.eventId);
      }
      settle(
        services.upload.sendGeofenceEvent(event).then(outcome => {
          if (outcome === 'uploaded' || outcome === 'duplicate') {
            markBackgroundEventUploaded(event.eventId);
          }
        }),
      );
    },
    [services.upload],
  );

  const acceptNativeEvent = useCallback(
    (nativeEvent: NativeGeofenceEvent) => {
      if (
        !deduperRef.current.accept(
          nativeEvent.schoolId,
          nativeEvent.eventType,
          nativeEvent.timestamp,
        )
      ) {
        return;
      }
      const event = toGeofenceEvent(nativeEvent, nativeEvent.uploaded ? 'uploaded' : 'pending');
      if (nativeEvent.uploaded) {
        setEvents(current => [event, ...current].slice(0, 100));
        if (nativeEvent.schoolId === (officeRef.current?.schoolId ?? OFFICE_ID)) {
          setOfficePresence(nativeEvent.eventType === 'EXIT' ? 'outside' : 'inside');
        }
        return;
      }
      publishEvent(event);
    },
    [publishEvent],
  );

  useEffect(() => {
    const unsubscribe = subscribeBackgroundTransitions(acceptNativeEvent);
    settle(
      drainPendingBackgroundEvents().then(pendingEvents => {
        pendingEvents.forEach(acceptNativeEvent);
      }),
    );
    return unsubscribe;
  }, [acceptNativeEvent]);

  const configureOffice = useCallback(
    (configuredOffice: {id?: string; latitude: number; longitude: number; radiusMeters: number; presence?: string; name?: string}) => {
      const region: GeofenceRegion = {
        schoolId: configuredOffice.id || OFFICE_ID,
        latitude: configuredOffice.latitude,
        longitude: configuredOffice.longitude,
        radiusMeters: configuredOffice.radiusMeters,
      };
      radiusRef.current = region.radiusMeters;
      setRadiusMetersState(region.radiusMeters);
      officeRef.current = region;
      setOffice(region);
      setOfficeName(configuredOffice.name || null);
      const initialPresence = configuredOffice.presence?.toLowerCase();
      const presence = initialPresence === 'outside' ? 'outside' : 'inside';
      services.geofencing.registerGeofence(region, presence);
      setOfficePresence(presence);
    },
    [services],
  );

  const setRadiusMeters = useCallback(
    (meters: number) => {
      radiusRef.current = meters;
      setRadiusMetersState(meters);
      const current = officeRef.current;
      if (current == null || current.radiusMeters === meters) {
        return;
      }
      const region: GeofenceRegion = {...current, radiusMeters: meters};
      officeRef.current = region;
      setOffice(region);
      const presence = services.geofencing.getPresence()[current.schoolId];
      services.geofencing.registerGeofence(
        region,
        presence === 'inside' || presence === 'outside' ? presence : 'inside',
      );
      const fix = locationRef.current;
      if (fix != null) {
        services.geofencing.processLocation(fix);
        const result = services.geofencing.processLocation(fix);
        const nextPresence = services.geofencing.getPresence()[current.schoolId];
        if (nextPresence === 'inside' || nextPresence === 'outside') {
          setOfficePresence(nextPresence);
        }
        result.transitions.forEach(transition => {
          if (
            !deduperRef.current.accept(
              transition.schoolId,
              transition.eventType,
              transition.timestamp,
            )
          ) {
            return;
          }
          publishEvent(createEvent(transition));
        });
      }
      const apiBaseUrl = services.environment.useMockApi ? '' : services.environment.apiBaseUrl;
      settle(
        startBackgroundMonitoring([region], apiBaseUrl)
          .then(started => {
            setBackgroundActive(started && backgroundPermissionRef.current === 'granted');
          })
          .catch(() => {
            setNotice(
              'Background regions could not be registered. Foreground detection is still running.',
            );
          }),
      );
    },
    [publishEvent, services],
  );

  const onFix = useCallback(
    (fix: LocationFix) => {
      locationRef.current = fix;
      setLocation(fix);
      const result = services.geofencing.processLocation(fix);
      const nextPresence = services.geofencing.getPresence()[officeRef.current?.schoolId ?? OFFICE_ID];
      if (nextPresence === 'inside' || nextPresence === 'outside') {
        setOfficePresence(nextPresence);
      }
      setAccuracyAccepted(result.accepted);
      result.transitions.forEach(transition => {
        if (
          !deduperRef.current.accept(
            transition.schoolId,
            transition.eventType,
            transition.timestamp,
          )
        ) {
          return;
        }
        publishEvent(createEvent(transition));
      });
      settle(services.upload.handleFix(fix));
    },
    [publishEvent, services],
  );

  const onLocationError = useCallback((error: LocationTrackingError) => {
    setErrorMessage(error.message);
    if (error.code === 'permission-denied' || error.code === 'permission-restricted') {
      setPermissionDenied(true);
      setTrackingStatus('stopped');
    }
    if (error.code === 'gps-disabled') {
      setTrackingStatus('stopped');
    }
  }, []);

  const startTracking = useCallback(async (officeId?: string, forceRestart = false) => {
    if (!forceRestart && (trackingStatus === 'tracking' || trackingStatus === 'starting')) {
      return;
    }
    setTrackingStatus('starting');
    setErrorMessage(null);
    setNotice(null);
    setPermissionDenied(false);
    try {
      officeRef.current = null;
      setOffice(null);
      setOfficeName(null);
      setOfficePresence('unknown');
      const configuredOffice = await services.api.getOffice(officeId);
      if (!configuredOffice) {
        throw new Error('No office location is configured in the API. Add the office in the admin portal and try again.');
      }
      configureOffice(configuredOffice);
      await requestGeofenceNotificationPermission();
      services.upload.setTracking(true);
      clearSubscriptions();
      subscriptionsRef.current = [
        services.location.subscribe(onFix),
        services.location.subscribeErrors(onLocationError),
      ];
      await services.location.start();
      backgroundPermissionRef.current = await requestBackgroundLocation();
      const region = officeRef.current;
      if (region) {
        const apiBaseUrl = services.environment.useMockApi ? '' : services.environment.apiBaseUrl;
        settle(startBackgroundMonitoring([region], apiBaseUrl).then(started => {
          setBackgroundActive(started && backgroundPermissionRef.current === 'granted');
        }).catch(() => {
          setNotice('Background regions could not be registered. Foreground detection is still running.');
        }));
      }
      if (backgroundPermissionRef.current !== 'granted') {
        setNotice(backgroundPermissionCopy);
      }
      setTrackingStatus('tracking');
    } catch (error) {
      clearSubscriptions();
      services.location.stop();
      services.geofencing.stop();
      services.upload.setTracking(false);
      setBackgroundActive(false);
      settle(stopBackgroundMonitoring());
      const trackingError = error as LocationTrackingError;
      if (
        trackingError.code === 'permission-denied' ||
        trackingError.code === 'permission-restricted'
      ) {
        setPermissionDenied(true);
      }
      setErrorMessage(
        error instanceof Error ? error.message : 'Tracking could not be started.',
      );
      setTrackingStatus('stopped');
    }
  }, [clearSubscriptions, configureOffice, onFix, onLocationError, services, trackingStatus]);

  const stopTracking = useCallback(() => {
    clearSubscriptions();
    services.location.stop();
    services.geofencing.stop();
    services.upload.setTracking(false);
    setBackgroundActive(false);
    settle(stopBackgroundMonitoring());
    const currentOfficeId = officeRef.current?.schoolId ?? OFFICE_ID;
    officeRef.current = null;
    setOffice(null);
    setOfficePresence('unknown');
    services.geofencing.removeGeofence(currentOfficeId);
    setTrackingStatus('stopped');
    settle(
      services.upload.flush().finally(() => {
        settle(refreshPending());
      }),
    );
  }, [clearSubscriptions, refreshPending, services]);

  const switchOffice = useCallback(async (officeId: string) => {
    const wasTracking = trackingStatus === 'tracking' || trackingStatus === 'starting';
    if (!wasTracking) return;
    stopTracking();
    await stopBackgroundMonitoring();
    await startTracking(officeId, true);
  }, [startTracking, stopTracking, trackingStatus]);

  const distanceMeters = useMemo(() => {
    if (!office || !location) {
      return null;
    }
    return haversineDistanceMeters(location, office);
  }, [location, office]);

  return {
    useMockApi: services.environment.useMockApi,
    apiBaseUrl: services.environment.apiBaseUrl,
    office,
    officeName,
    radiusMeters,
    setRadiusMeters,
    officePresence,
    distanceMeters,
    events,
    location,
    trackingStatus,
    permissionDenied,
    errorMessage,
    notice,
    isOnline,
    pendingCount,
    lastSuccessAt,
    accuracyAccepted,
    geofencingLabel: backgroundPlatformLabel(
      backgroundActive,
      trackingStatus === 'tracking',
    ),
    startTracking,
    stopTracking,
    switchOffice,
  };
}
