import {NativeEventEmitter, NativeModules, PermissionsAndroid, Platform} from 'react-native';
import type {GeofenceEvent, GeofenceEventType, GeofenceRegion} from '../types';

export interface NativeGeofenceEvent {
  eventId: string;
  schoolId: string;
  eventType: GeofenceEventType;
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  uploaded: boolean;
}

interface GeoFenceBackgroundModule {
  startMonitoring(regions: GeofenceRegion[], apiBaseUrl: string): Promise<boolean>;
  stopMonitoring(): Promise<boolean>;
  drainPending(): Promise<NativeGeofenceEvent[]>;
  markUploaded(eventId: string): void;
  showGeofenceNotification?(eventType: GeofenceEventType, eventId: string): void;
  requestNotificationPermission?(): Promise<boolean>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

function module(): GeoFenceBackgroundModule | null {
  const native = NativeModules.GeoFenceBackground as GeoFenceBackgroundModule | undefined;
  return native ?? null;
}

export function isBackgroundGeofenceAvailable(): boolean {
  return module() != null;
}

export function toGeofenceEvent(
  event: NativeGeofenceEvent,
  uploadStatus: GeofenceEvent['uploadStatus'] = 'pending',
): GeofenceEvent {
  return {
    eventId: event.eventId,
    schoolId: event.schoolId,
    eventType: event.eventType,
    latitude: event.latitude,
    longitude: event.longitude,
    accuracy: event.accuracy,
    eventTime: new Date(event.timestamp).toISOString(),
    serverReceivedAt: null,
    uploadStatus,
  };
}

export async function startBackgroundMonitoring(
  regions: GeofenceRegion[],
  apiBaseUrl: string,
): Promise<boolean> {
  const native = module();
  if (!native) {
    return false;
  }
  await native.startMonitoring(regions, apiBaseUrl);
  return true;
}

export async function stopBackgroundMonitoring(): Promise<void> {
  const native = module();
  if (!native) {
    return;
  }
  await native.stopMonitoring();
}

export async function drainPendingBackgroundEvents(): Promise<NativeGeofenceEvent[]> {
  const native = module();
  if (!native) {
    return [];
  }
  const events = await native.drainPending();
  return Array.isArray(events) ? events : [];
}

export function markBackgroundEventUploaded(eventId: string): void {
  module()?.markUploaded(eventId);
}

export function showGeofenceNotification(eventType: GeofenceEventType, eventId: string): void {
  module()?.showGeofenceNotification?.(eventType, eventId);
}

export async function requestGeofenceNotificationPermission(): Promise<void> {
  if (Platform.OS === 'android') {
    if (Number(Platform.Version) < 33) {
      return;
    }
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS, {
      title: 'Office alerts',
      message: 'Allow notifications so GeoFencePOC can tell you when you enter or leave the office area.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    });
    return;
  }
  const native = module();
  if (native?.requestNotificationPermission) {
    await native.requestNotificationPermission();
  }
}

export function subscribeBackgroundTransitions(
  listener: (event: NativeGeofenceEvent) => void,
): () => void {
  const native = module();
  if (!native) {
    return () => undefined;
  }
  const emitter = new NativeEventEmitter(native);
  const subscription = emitter.addListener('geofenceTransition', listener);
  return () => subscription.remove();
}

export function backgroundPlatformLabel(active: boolean, tracking: boolean): string {
  if (active && tracking) {
    return 'Foreground + background';
  }
  if (active) {
    return 'Background regions';
  }
  if (tracking) {
    return 'Foreground only';
  }
  return 'Not monitoring';
}

export const backgroundPermissionCopy =
  Platform.OS === 'ios'
    ? 'Choose Always so school entry and exit can be detected after the app is closed. While Using keeps detection limited to the open app.'
    : 'Choose Allow all the time so school entry and exit can be detected after the app is closed.';
