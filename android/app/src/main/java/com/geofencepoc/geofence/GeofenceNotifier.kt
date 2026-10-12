package com.geofencepoc.geofence

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.geofencepoc.MainActivity
import org.json.JSONArray

object GeofenceNotifier {
  private const val CHANNEL_ID = "office-geofence"
  private const val PREFS = "geofencepoc.background"
  private const val KEY_ID = "notifyEventId"
  private const val KEY_TYPE = "notifyEventType"
  private const val KEY_AT = "notifyAt"
  private const val WINDOW_MS = 60_000L

  fun showTransition(context: Context, eventType: String, eventId: String) {
    val inside = eventType != "EXIT"
    val radius = officeRadiusMeters(context, eventId)
    val area = if (radius == null) "office area" else "$radius m office area"
    show(
      context,
      title = if (inside) "Inside the office area" else "Outside the office area",
      body = if (inside) "You entered the $area." else "You left the $area.",
      eventType = if (inside) "ENTER" else "EXIT",
      eventId = eventId,
    )
  }

  fun show(context: Context, title: String, body: String, eventType: String, eventId: String) {
    if (!claim(context, eventType, eventId)) {
      return
    }
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Office geofence",
        NotificationManager.IMPORTANCE_HIGH,
      ).apply {
        description = "Alerts when you enter or leave the office area"
        enableVibration(true)
      }
      manager.createNotificationChannel(channel)
    }
    val launch = Intent(context, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val pending = PendingIntent.getActivity(
      context,
      0,
      launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_dialog_map)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setAutoCancel(true)
      .setContentIntent(pending)
      .build()
    try {
      manager.notify(if (eventType == "EXIT") 1002 else 1001, notification)
    } catch (_: SecurityException) {
      // Notification permission was denied.
    }
  }

  private fun officeRadiusMeters(context: Context, eventId: String): Int? {
    val regions = JSONArray(GeofenceStore.regionsJson(context))
    for (index in 0 until regions.length()) {
      val region = regions.getJSONObject(index)
      val schoolId = region.optString("schoolId")
      if (schoolId.isNotEmpty() && eventId.startsWith("$schoolId:")) {
        val radius = region.optDouble("radiusMeters", Double.NaN)
        if (radius.isFinite() && radius > 0) {
          return radius.toInt()
        }
      }
    }
    return null
  }

  private fun claim(context: Context, eventType: String, eventId: String): Boolean {
    val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val now = System.currentTimeMillis()
    val lastId = prefs.getString(KEY_ID, "")
    val lastType = prefs.getString(KEY_TYPE, "")
    val lastAt = prefs.getLong(KEY_AT, 0L)
    if (eventId.isNotBlank() && eventId == lastId) {
      return false
    }
    if (eventType == lastType && now - lastAt < WINDOW_MS) {
      return false
    }
    prefs.edit()
      .putString(KEY_ID, eventId)
      .putString(KEY_TYPE, eventType)
      .putLong(KEY_AT, now)
      .commit()
    return true
  }
}
