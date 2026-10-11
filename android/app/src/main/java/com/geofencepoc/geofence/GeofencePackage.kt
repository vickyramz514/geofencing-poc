package com.geofencepoc.geofence

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class GeofencePackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
    return if (name == "GeoFenceBackground") GeofenceModule(reactContext) else null
  }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
    return ReactModuleInfoProvider {
      mapOf(
        "GeoFenceBackground" to ReactModuleInfo(
          "GeoFenceBackground",
          GeofenceModule::class.java.name,
          false,
          false,
          false,
          false,
        ),
      )
    }
  }
}
