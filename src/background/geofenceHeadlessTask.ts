import {createAppServices} from '../services/createAppServices';
import {
  markBackgroundEventUploaded,
  toGeofenceEvent,
  type NativeGeofenceEvent,
} from '../services/nativeBackgroundGeofence';

export async function geofenceHeadlessTask(data: NativeGeofenceEvent): Promise<void> {
  if (!data?.eventId || !data.schoolId || !data.eventType) {
    return;
  }
  const services = createAppServices();
  const event = toGeofenceEvent(data);
  const outcome = await services.upload.sendGeofenceEvent(event);
  if (outcome === 'uploaded' || outcome === 'duplicate' || data.uploaded) {
    markBackgroundEventUploaded(data.eventId);
  }
}
