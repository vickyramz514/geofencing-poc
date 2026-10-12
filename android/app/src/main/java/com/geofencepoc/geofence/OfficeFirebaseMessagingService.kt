package com.geofencepoc.geofence

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class OfficeFirebaseMessagingService : FirebaseMessagingService() {
  override fun onMessageReceived(message: RemoteMessage) {
    val title = message.notification?.title ?: message.data["title"] ?: return
    val body = message.notification?.body ?: message.data["body"] ?: ""
    val eventType = message.data["eventType"] ?: "ENTER"
    GeofenceNotifier.show(
      this,
      title = title,
      body = body,
      eventType = eventType,
      eventId = message.messageId ?: "$eventType:${System.currentTimeMillis()}",
    )
  }
}
