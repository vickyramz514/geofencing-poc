import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import NetInfo from '@react-native-community/netinfo';
import {Platform} from 'react-native';
import {MOCK_ROUTE, MOCK_SCHOOLS, initialDeliveryStatuses} from '../data/mockSchools';
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
  DeliveryStatus,
  GeofenceEvent,
  GeofenceTransition,
  LocationFix,
  LocationTrackingError,
  Presence,
  TrackingStatus,
} from '../types';
import {canTransition} from '../utils/deliveryStatus';
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
  const deliveriesRef = useRef(initialDeliveryStatuses());

  const [trackingStatus, setTrackingStatus] = useState<TrackingStatus>('idle');
  const [location, setLocation] = useState<LocationFix | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSuccessAt, setLastSuccessAt] = useState<string | null>(null);
  const [events, setEvents] = useState<GeofenceEvent[]>([]);
  const [deliveries, setDeliveries] = useState(deliveriesRef.current);
  const [suggestions, setSuggestions] = useState<Record<string, boolean>>({});
  const [presence, setPresence] = useState<Record<string, Presence | 'unknown'>>({});
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>(MOCK_SCHOOLS[0].id);
  const [busySchoolId, setBusySchoolId] = useState<string | null>(null);
  const [accuracyAccepted, setAccuracyAccepted] = useState(true);
  const [backgroundActive, setBackgroundActive] = useState(false);

  deliveriesRef.current = deliveries;

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
    (event: GeofenceEvent, entered: boolean) => {
      setEvents(current => [event, ...current].slice(0, 100));
      setSuggestions(current => ({
        ...current,
        [event.schoolId]: entered,
      }));
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
        setSuggestions(current => ({
          ...current,
          [nativeEvent.schoolId]: nativeEvent.eventType === 'ENTER',
        }));
        return;
      }
      publishEvent(event, nativeEvent.eventType === 'ENTER');
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

  const onFix = useCallback(
    (fix: LocationFix) => {
      setLocation(fix);
      const result = services.geofencing.processLocation(fix);
      setPresence(services.geofencing.getPresence());
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
        publishEvent(createEvent(transition), transition.eventType === 'ENTER');
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

  const startTracking = useCallback(async () => {
    if (trackingStatus === 'tracking' || trackingStatus === 'starting') {
      return;
    }
    setTrackingStatus('starting');
    setErrorMessage(null);
    setNotice(null);
    setPermissionDenied(false);
    try {
      const regions = MOCK_SCHOOLS.map(school => ({
        schoolId: school.id,
        latitude: school.latitude,
        longitude: school.longitude,
        radiusMeters: school.radiusMeters,
      }));
      services.geofencing.registerSchools(regions);
      services.upload.setTracking(true);
      clearSubscriptions();
      subscriptionsRef.current = [
        services.location.subscribe(onFix),
        services.location.subscribeErrors(onLocationError),
      ];
      await services.location.start();
      const backgroundPermission = await requestBackgroundLocation();
      let nativeStarted = false;
      try {
        nativeStarted = await startBackgroundMonitoring(
          regions,
          services.environment.useMockApi ? '' : services.environment.apiBaseUrl,
        );
      } catch {
        setNotice(
          'Background regions could not be registered. Foreground detection is still running.',
        );
      }
      const backgroundOn = nativeStarted && backgroundPermission === 'granted';
      setBackgroundActive(backgroundOn);
      if (nativeStarted && (Platform.OS === 'ios' || !backgroundOn)) {
        setNotice(backgroundPermissionCopy);
      }
      setPresence(services.geofencing.getPresence());
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
    setTrackingStatus('stopped');
    setPresence(services.geofencing.getPresence());
    settle(
      services.upload.flush().finally(() => {
        settle(refreshPending());
      }),
    );
  }, [clearSubscriptions, refreshPending, services]);

  const advanceDelivery = useCallback(
    async (schoolId: string, status: DeliveryStatus) => {
      const current = deliveriesRef.current[schoolId];
      if (!current || !canTransition(current, status)) {
        return;
      }
      setBusySchoolId(schoolId);
      setErrorMessage(null);
      try {
        const outcome = await services.upload.sendDeliveryStatus({
          deliveryId: MOCK_ROUTE.id,
          schoolId,
          status,
        });
        setDeliveries(previous => ({...previous, [schoolId]: status}));
        if (status === 'ARRIVED') {
          setSuggestions(previous => ({...previous, [schoolId]: false}));
        }
        setNotice(
          outcome === 'queued'
            ? 'Status saved on this device. It will sync when the network returns.'
            : null,
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : 'Delivery status could not be updated.',
        );
      } finally {
        setBusySchoolId(null);
        await refreshPending();
      }
    },
    [refreshPending, services.upload],
  );

  const schools = useMemo(
    () =>
      MOCK_SCHOOLS.map(school => ({
        school,
        distanceMeters: location
          ? haversineDistanceMeters(location, school)
          : null,
        presence: presence[school.id] ?? 'unknown',
        status: deliveries[school.id] ?? 'PENDING',
        arrivalSuggested:
          Boolean(suggestions[school.id]) && deliveries[school.id] === 'IN_TRANSIT',
      })),
    [deliveries, location, presence, suggestions],
  );

  const selectedSchool = schools.find(item => item.school.id === selectedSchoolId) ?? schools[0];

  return {
    route: MOCK_ROUTE,
    useMockApi: services.environment.useMockApi,
    apiBaseUrl: services.environment.apiBaseUrl,
    schools,
    selectedSchool,
    events,
    location,
    trackingStatus,
    permissionDenied,
    errorMessage,
    notice,
    isOnline,
    pendingCount,
    lastSuccessAt,
    busySchoolId,
    accuracyAccepted,
    geofencingLabel: backgroundPlatformLabel(
      backgroundActive,
      trackingStatus === 'tracking',
    ),
    startTracking,
    stopTracking,
    advanceDelivery,
    selectSchool: setSelectedSchoolId,
  };
}
