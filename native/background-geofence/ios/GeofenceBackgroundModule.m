#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

#import "GeofenceCoordinator.h"

@interface GeofenceBackgroundModule : RCTEventEmitter <RCTBridgeModule>
@end

@implementation GeofenceBackgroundModule

RCT_EXPORT_MODULE(GeoFenceBackground);

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

- (NSArray<NSString *> *)supportedEvents {
  return @[@"geofenceTransition"];
}

- (void)startObserving {
  __weak GeofenceBackgroundModule *weakSelf = self;
  [[GeofenceCoordinator shared] setEventHandler:^(NSDictionary *event) {
    [weakSelf sendEventWithName:@"geofenceTransition" body:event];
  }];
}

- (void)stopObserving {
  [[GeofenceCoordinator shared] setEventHandler:nil];
}

RCT_EXPORT_METHOD(startMonitoring:(NSArray *)regions
                  apiBaseUrl:(NSString *)apiBaseUrl
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    [[GeofenceCoordinator shared] startMonitoringRegions:regions apiBaseUrl:apiBaseUrl ?: @""];
    resolve(@YES);
  });
}

RCT_EXPORT_METHOD(stopMonitoring:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    [[GeofenceCoordinator shared] stopMonitoring];
    resolve(@YES);
  });
}

RCT_EXPORT_METHOD(drainPending:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  resolve([[GeofenceCoordinator shared] pendingEvents]);
}

RCT_EXPORT_METHOD(markUploaded:(NSString *)eventId) {
  [[GeofenceCoordinator shared] markUploaded:eventId];
}

@end
