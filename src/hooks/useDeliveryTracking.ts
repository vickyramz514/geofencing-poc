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

export function useDeliveryTracking() {
  const servicesRef = useRef<AppServices | null>(null);
  if (servicesRef.current == null) {
    servicesRef.current = createAppServices();
  }
  const services = servicesRef.current;
  const subscriptionsRef = useRef<Array<() => void>>([]);
  const deduperRef = useRef<TransitionDeduper>(createTransitionDeduper());
  const officeRef = useRef<GeofenceRegion | null>(null);
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
  const [office, setOffice] = useState<GeofenceRegion | null>(null);
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
      if (event.schoolId === OFFICE_ID) {
        setOfficePresence(event.eventType === 'EXIT' ? 'outside' : 'inside');
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
        if (nativeEvent.schoolId === OFFICE_ID) {
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

  const anchorOffice = useCallback(
    (fix: LocationFix) => {
      const region: GeofenceRegion = {
        schoolId: OFFICE_ID,
        latitude: fix.latitude,
        longitude: fix.longitude,
        radiusMeters: OFFICE_RADIUS_METERS,
      };
      officeRef.current = region;
      setOffice(region);
      services.geofencing.registerGeofence(region, 'inside');
      setOfficePresence('inside');
      settle(
        services.api.postOffice({
          latitude: region.latitude,
          longitude: region.longitude,
          radiusMeters: region.radiusMeters,
          anchoredAt: new Date(fix.timestamp).toISOString(),
        }),
      );
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
    [services],
  );

  const onFix = useCallback(
    (fix: LocationFix) => {
      setLocation(fix);
      if (officeRef.current == null) {
        anchorOffice(fix);
      }
      const result = services.geofencing.processLocation(fix);
      const nextPresence = services.geofencing.getPresence()[OFFICE_ID];
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
    [anchorOffice, publishEvent, services],
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

  const startTracking = useCallback(async () => {
    if (trackingStatus === 'tracking' || trackingStatus === 'starting') {
      return;
    }
    setTrackingStatus('starting');
    setErrorMessage(null);
    setNotice(null);
    setPermissionDenied(false);
    try {
      officeRef.current = null;
      setOffice(null);
      setOfficePresence('unknown');
      services.upload.setTracking(true);
      clearSubscriptions();
      subscriptionsRef.current = [
        services.location.subscribe(onFix),
        services.location.subscribeErrors(onLocationError),
      ];
      await services.location.start();
      backgroundPermissionRef.current = await requestBackgroundLocation();
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
  }, [clearSubscriptions, onFix, onLocationError, services, trackingStatus]);

  const stopTracking = useCallback(() => {
    clearSubscriptions();
    services.location.stop();
    services.geofencing.stop();
    services.upload.setTracking(false);
    setBackgroundActive(false);
    settle(stopBackgroundMonitoring());
    officeRef.current = null;
    setOffice(null);
    setOfficePresence('unknown');
    services.geofencing.removeGeofence(OFFICE_ID);
    setTrackingStatus('stopped');
    settle(
      services.upload.flush().finally(() => {
        settle(refreshPending());
      }),
    );
  }, [clearSubscriptions, refreshPending, services]);

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
  };
}
