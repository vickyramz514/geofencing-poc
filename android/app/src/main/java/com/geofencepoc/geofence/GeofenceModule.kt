package com.geofencepoc.geofence

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray
import org.json.JSONObject

object GeofenceEvents {
  @Volatile
  private var reactContext: ReactApplicationContext? = null

  fun attach(context: ReactApplicationContext) {
    reactContext = context
  }

  fun emit(event: StoredGeofenceEvent): Boolean {
    val context = reactContext ?: return false
    if (!context.hasActiveReactInstance()) {
      return false
    }
    return try {
      context
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("geofenceTransition", event.toMap())
      true
    } catch (_: Exception) {
      false
    }
  }
}

class GeofenceModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "GeoFenceBackground"

  override fun initialize() {
    super.initialize()
    GeofenceEvents.attach(reactContext)
  }

  @ReactMethod
  fun startMonitoring(regions: ReadableArray, apiBaseUrl: String, promise: Promise) {
    try {
      val stored = JSONArray()
      for (index in 0 until regions.size()) {
        val region = regions.getMap(index) ?: continue
        stored.put(
          JSONObject()
            .put("schoolId", region.getString("schoolId"))
            .put("latitude", region.getDouble("latitude"))
            .put("longitude", region.getDouble("longitude"))
            .put("radiusMeters", region.getDouble("radiusMeters")),
        )
      }
      GeofenceStore.saveRegions(reactContext, stored.toString())
      GeofenceStore.setApiBaseUrl(reactContext, apiBaseUrl)
      GeofenceStore.setEnabled(reactContext, true)
      GeofenceRegistrar.registerStoredRegions(reactContext)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("E_GEOFENCE", error.message, error)
    }
  }

  @ReactMethod
  fun stopMonitoring(promise: Promise) {
    GeofenceStore.setEnabled(reactContext, false)
    GeofenceRegistrar.clear(reactContext)
    promise.resolve(true)
  }

  @ReactMethod
  fun drainPending(promise: Promise) {
    val events = Arguments.createArray()
    GeofenceStore.pending(reactContext).forEach { event ->
      events.pushMap(event.toMap())
    }
    promise.resolve(events)
  }

  @ReactMethod
  fun markUploaded(eventId: String) {
    GeofenceStore.markUploaded(reactContext, eventId)
  }

  @ReactMethod
  fun addListener(eventName: String) {
  }

  @ReactMethod
  fun removeListeners(count: Int) {
  }
}

private fun StoredGeofenceEvent.toMap(): WritableMap {
  return Arguments.createMap().apply {
    putString("eventId", eventId)
    putString("schoolId", schoolId)
    putString("eventType", eventType)
    putDouble("latitude", latitude)
    putDouble("longitude", longitude)
    putDouble("accuracy", accuracy)
    putDouble("timestamp", timestamp.toDouble())
    putBoolean("uploaded", uploaded)
  }
}
