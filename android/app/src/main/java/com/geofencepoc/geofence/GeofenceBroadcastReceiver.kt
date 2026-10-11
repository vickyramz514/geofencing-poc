package com.geofencepoc.geofence

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingEvent

class GeofenceBroadcastReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val geofencingEvent = GeofencingEvent.fromIntent(intent) ?: return
    if (geofencingEvent.hasError()) {
      return
    }
    val eventType = when (geofencingEvent.geofenceTransition) {
      Geofence.GEOFENCE_TRANSITION_ENTER -> "ENTER"
      Geofence.GEOFENCE_TRANSITION_EXIT -> "EXIT"
      else -> return
    }
    val location = geofencingEvent.triggeringLocation
    val timestamp = location?.time ?: System.currentTimeMillis()
    val pendingResult = goAsync()
    Thread {
      try {
        geofencingEvent.triggeringGeofences?.forEach { fence ->
          val event = StoredGeofenceEvent(
            eventId = "${fence.requestId}:$eventType:$timestamp",
            schoolId = fence.requestId,
            eventType = eventType,
            latitude = location?.latitude ?: 0.0,
            longitude = location?.longitude ?: 0.0,
            accuracy = location?.accuracy?.toDouble() ?: 0.0,
            timestamp = timestamp,
            uploaded = false,
          )
          GeofenceStore.addPending(context, event)
          if (!GeofenceEvents.emit(event)) {
            GeofenceHeadlessService.start(context, event)
            GeofenceUploader.postEvent(context, event)
          }
        }
      } finally {
        pendingResult.finish()
      }
    }.start()
  }
}

class GeofenceBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (GeofenceStore.isEnabled(context)) {
      GeofenceRegistrar.registerStoredRegions(context)
    }
  }
}

class GeofenceHeadlessService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val extras = intent?.extras ?: return null
    return HeadlessJsTaskConfig(
      "GeofenceBackgroundTask",
      Arguments.fromBundle(extras),
      30000L,
      false,
    )
  }

  companion object {
    fun start(context: Context, event: StoredGeofenceEvent) {
      val intent = Intent(context, GeofenceHeadlessService::class.java).apply {
        putExtra("eventId", event.eventId)
        putExtra("schoolId", event.schoolId)
        putExtra("eventType", event.eventType)
        putExtra("latitude", event.latitude)
        putExtra("longitude", event.longitude)
        putExtra("accuracy", event.accuracy)
        putExtra("timestamp", event.timestamp.toDouble())
      }
      try {
        context.startService(intent)
      } catch (_: Exception) {
        // The receiver uploads directly when a background service cannot start.
      }
    }
  }
}
