package com.geofencepoc.geofence

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

data class StoredGeofenceEvent(
  val eventId: String,
  val schoolId: String,
  val eventType: String,
  val latitude: Double,
  val longitude: Double,
  val accuracy: Double,
  val timestamp: Long,
  val uploaded: Boolean,
)

object GeofenceStore {
  private const val PREFS = "geofencepoc.background"
  private const val KEY_REGIONS = "regions"
  private const val KEY_PENDING = "pending"
  private const val KEY_ENABLED = "enabled"
  private const val KEY_API = "apiBaseUrl"

  fun setEnabled(context: Context, enabled: Boolean) {
    prefs(context).edit().putBoolean(KEY_ENABLED, enabled).commit()
  }

  fun isEnabled(context: Context): Boolean = prefs(context).getBoolean(KEY_ENABLED, false)

  fun setApiBaseUrl(context: Context, apiBaseUrl: String) {
    prefs(context).edit().putString(KEY_API, apiBaseUrl).commit()
  }

  fun apiBaseUrl(context: Context): String = prefs(context).getString(KEY_API, "") ?: ""

  fun saveRegions(context: Context, regionsJson: String) {
    prefs(context).edit().putString(KEY_REGIONS, regionsJson).commit()
  }

  fun regionsJson(context: Context): String = prefs(context).getString(KEY_REGIONS, "[]") ?: "[]"

  fun addPending(context: Context, event: StoredGeofenceEvent) {
    val events = pending(context).toMutableList()
    if (events.any { it.eventId == event.eventId }) {
      return
    }
    events.add(event)
    writePending(context, events.takeLast(200))
  }

  fun pending(context: Context): List<StoredGeofenceEvent> {
    val raw = prefs(context).getString(KEY_PENDING, "[]") ?: "[]"
    val array = JSONArray(raw)
    return (0 until array.length()).map { index ->
      val item = array.getJSONObject(index)
      StoredGeofenceEvent(
        eventId = item.getString("eventId"),
        schoolId = item.getString("schoolId"),
        eventType = item.getString("eventType"),
        latitude = item.getDouble("latitude"),
        longitude = item.getDouble("longitude"),
        accuracy = item.optDouble("accuracy", 0.0),
        timestamp = item.getLong("timestamp"),
        uploaded = item.optBoolean("uploaded", false),
      )
    }
  }

  fun markUploaded(context: Context, eventId: String) {
    val events = pending(context).map { event ->
      if (event.eventId == eventId) event.copy(uploaded = true) else event
    }
    writePending(context, events)
  }

  private fun writePending(context: Context, events: List<StoredGeofenceEvent>) {
    val array = JSONArray()
    events.forEach { event ->
      array.put(
        JSONObject()
          .put("eventId", event.eventId)
          .put("schoolId", event.schoolId)
          .put("eventType", event.eventType)
          .put("latitude", event.latitude)
          .put("longitude", event.longitude)
          .put("accuracy", event.accuracy)
          .put("timestamp", event.timestamp)
          .put("uploaded", event.uploaded),
      )
    }
    prefs(context).edit().putString(KEY_PENDING, array.toString()).commit()
  }

  private fun prefs(context: Context) =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
