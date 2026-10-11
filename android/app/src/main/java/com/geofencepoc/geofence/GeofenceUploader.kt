package com.geofencepoc.geofence

import android.content.Context
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import org.json.JSONObject

object GeofenceUploader {
  fun postEvent(context: Context, event: StoredGeofenceEvent): Boolean {
    val apiBaseUrl = GeofenceStore.apiBaseUrl(context)
    if (apiBaseUrl.isBlank()) {
      return false
    }
    val connection = (URL("${apiBaseUrl.trimEnd('/')}/api/geofence-events").openConnection() as HttpURLConnection)
    return try {
      val body = JSONObject()
        .put("eventId", event.eventId)
        .put("schoolId", event.schoolId)
        .put("eventType", event.eventType)
        .put("latitude", event.latitude)
        .put("longitude", event.longitude)
        .put("accuracy", event.accuracy)
        .put("eventTime", Instant.ofEpochMilli(event.timestamp).toString())
      connection.requestMethod = "POST"
      connection.connectTimeout = 15000
      connection.readTimeout = 15000
      connection.doOutput = true
      connection.setRequestProperty("Accept", "application/json")
      connection.setRequestProperty("Content-Type", "application/json")
      connection.setRequestProperty("Idempotency-Key", event.eventId)
      connection.outputStream.use { stream ->
        stream.write(body.toString().toByteArray(Charsets.UTF_8))
      }
      val ok = connection.responseCode in 200..299
      if (ok) {
        GeofenceStore.markUploaded(context, event.eventId)
      }
      ok
    } catch (_: Exception) {
      false
    } finally {
      connection.disconnect()
    }
  }
}
