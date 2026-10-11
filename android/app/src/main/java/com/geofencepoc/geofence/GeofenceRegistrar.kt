package com.geofencepoc.geofence

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices
import org.json.JSONArray

object GeofenceRegistrar {
  fun pendingIntent(context: Context): PendingIntent {
    val intent = Intent(context, GeofenceBroadcastReceiver::class.java)
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
    return PendingIntent.getBroadcast(context, 0, intent, flags)
  }

  @SuppressLint("MissingPermission")
  fun registerStoredRegions(context: Context) {
    val regions = JSONArray(GeofenceStore.regionsJson(context))
    if (regions.length() == 0) {
      return
    }
    val geofences = (0 until regions.length()).map { index ->
      val region = regions.getJSONObject(index)
      Geofence.Builder()
        .setRequestId(region.getString("schoolId"))
        .setCircularRegion(
          region.getDouble("latitude"),
          region.getDouble("longitude"),
          region.getDouble("radiusMeters").toFloat(),
        )
        .setExpirationDuration(Geofence.NEVER_EXPIRE)
        .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER or Geofence.GEOFENCE_TRANSITION_EXIT)
        .build()
    }
    val request = GeofencingRequest.Builder()
      .setInitialTrigger(0)
      .addGeofences(geofences)
      .build()
    val client = LocationServices.getGeofencingClient(context)
    val intent = pendingIntent(context)
    client.removeGeofences(intent).addOnCompleteListener {
      client.addGeofences(request, intent)
    }
  }

  fun clear(context: Context) {
    LocationServices.getGeofencingClient(context).removeGeofences(pendingIntent(context))
  }
}
