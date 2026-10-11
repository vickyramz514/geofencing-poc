#import "GeofenceCoordinator.h"

#import <CoreLocation/CoreLocation.h>
#import <UIKit/UIKit.h>

static NSString *const kRegionsKey = @"geofencepoc.regions";
static NSString *const kPendingKey = @"geofencepoc.pending";
static NSString *const kEnabledKey = @"geofencepoc.enabled";
static NSString *const kApiKey = @"geofencepoc.apiBaseUrl";

@interface GeofenceCoordinator () <CLLocationManagerDelegate>
@property (nonatomic, strong) CLLocationManager *manager;
@property (nonatomic, copy, nullable) GeofenceEventHandler eventHandler;
@end

@implementation GeofenceCoordinator

+ (instancetype)shared {
  static GeofenceCoordinator *coordinator;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    coordinator = [GeofenceCoordinator new];
  });
  return coordinator;
}

+ (void)load {
  [[NSNotificationCenter defaultCenter] addObserverForName:UIApplicationDidFinishLaunchingNotification
                                                    object:nil
                                                     queue:[NSOperationQueue mainQueue]
                                                usingBlock:^(__unused NSNotification *note) {
    if ([[NSUserDefaults standardUserDefaults] boolForKey:kEnabledKey]) {
      [[GeofenceCoordinator shared] restoreMonitoring];
    }
  }];
}

- (instancetype)init {
  if (self = [super init]) {
    _manager = [CLLocationManager new];
    _manager.delegate = self;
    _manager.allowsBackgroundLocationUpdates = NO;
  }
  return self;
}

- (void)startMonitoringRegions:(NSArray<NSDictionary *> *)regions apiBaseUrl:(NSString *)apiBaseUrl {
  NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
  [defaults setObject:regions forKey:kRegionsKey];
  [defaults setObject:apiBaseUrl forKey:kApiKey];
  [defaults setBool:YES forKey:kEnabledKey];
  CLAuthorizationStatus status = self.manager.authorizationStatus;
  if (status == kCLAuthorizationStatusNotDetermined || status == kCLAuthorizationStatusAuthorizedWhenInUse) {
    [self.manager requestAlwaysAuthorization];
  }
  [self armRegions:regions];
}

- (void)stopMonitoring {
  NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
  [defaults setBool:NO forKey:kEnabledKey];
  for (CLRegion *region in self.manager.monitoredRegions) {
    [self.manager stopMonitoringForRegion:region];
  }
  self.manager.allowsBackgroundLocationUpdates = NO;
}

- (void)restoreMonitoring {
  NSArray *regions = [[NSUserDefaults standardUserDefaults] arrayForKey:kRegionsKey];
  if (regions.count > 0) {
    [self armRegions:regions];
  }
}

- (void)armRegions:(NSArray<NSDictionary *> *)regions {
  if (self.manager.authorizationStatus == kCLAuthorizationStatusAuthorizedAlways) {
    self.manager.allowsBackgroundLocationUpdates = YES;
  }
  for (CLRegion *region in self.manager.monitoredRegions) {
    [self.manager stopMonitoringForRegion:region];
  }
  for (NSDictionary *region in regions) {
    NSString *identifier = region[@"schoolId"];
    CLLocationDegrees latitude = [region[@"latitude"] doubleValue];
    CLLocationDegrees longitude = [region[@"longitude"] doubleValue];
    CLLocationDistance radius = MAX([region[@"radiusMeters"] doubleValue], 100.0);
    CLCircularRegion *circle = [[CLCircularRegion alloc] initWithCenter:CLLocationCoordinate2DMake(latitude, longitude)
                                                                  radius:radius
                                                              identifier:identifier];
    circle.notifyOnEntry = YES;
    circle.notifyOnExit = YES;
    [self.manager startMonitoringForRegion:circle];
  }
}

- (NSArray<NSDictionary *> *)pendingEvents {
  return [[NSUserDefaults standardUserDefaults] arrayForKey:kPendingKey] ?: @[];
}

- (void)markUploaded:(NSString *)eventId {
  NSMutableArray *events = [[self pendingEvents] mutableCopy];
  for (NSUInteger index = 0; index < events.count; index++) {
    NSMutableDictionary *event = [events[index] mutableCopy];
    if ([event[@"eventId"] isEqualToString:eventId]) {
      event[@"uploaded"] = @YES;
      events[index] = event;
    }
  }
  [[NSUserDefaults standardUserDefaults] setObject:events forKey:kPendingKey];
}

- (void)setEventHandler:(GeofenceEventHandler)handler {
  _eventHandler = [handler copy];
}

- (void)recordTransition:(NSString *)eventType region:(CLRegion *)region {
  CLLocation *location = self.manager.location;
  NSDate *stamp = location.timestamp ?: [NSDate date];
  long long timestamp = (long long)(stamp.timeIntervalSince1970 * 1000.0);
  NSString *eventId = [NSString stringWithFormat:@"%@:%@:%lld", region.identifier, eventType, timestamp];
  NSDictionary *event = @{
    @"eventId": eventId,
    @"schoolId": region.identifier ?: @"",
    @"eventType": eventType,
    @"latitude": @(location ? location.coordinate.latitude : 0),
    @"longitude": @(location ? location.coordinate.longitude : 0),
    @"accuracy": @(location && location.horizontalAccuracy > 0 ? location.horizontalAccuracy : 0),
    @"timestamp": @(timestamp),
    @"uploaded": @NO,
  };
  NSMutableArray *events = [[self pendingEvents] mutableCopy];
  BOOL exists = NO;
  for (NSDictionary *stored in events) {
    if ([stored[@"eventId"] isEqualToString:eventId]) {
      exists = YES;
      break;
    }
  }
  if (!exists) {
    [events addObject:event];
    if (events.count > 200) {
      [events removeObjectsInRange:NSMakeRange(0, events.count - 200)];
    }
    [[NSUserDefaults standardUserDefaults] setObject:events forKey:kPendingKey];
  }
  if (self.eventHandler) {
    self.eventHandler(event);
  } else {
    [self uploadEvent:event];
  }
}

- (void)uploadEvent:(NSDictionary *)event {
  NSString *base = [[NSUserDefaults standardUserDefaults] stringForKey:kApiKey];
  if (base.length == 0) {
    return;
  }
  NSURL *url = [NSURL URLWithString:[[base stringByTrimmingCharactersInSet:[NSCharacterSet characterSetWithCharactersInString:@"/"]] stringByAppendingString:@"/api/geofence-events"]];
  if (url == nil) {
    return;
  }
  NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url];
  request.HTTPMethod = @"POST";
  [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
  [request setValue:@"application/json" forHTTPHeaderField:@"Accept"];
  [request setValue:event[@"eventId"] forHTTPHeaderField:@"Idempotency-Key"];
  NSISO8601DateFormatter *formatter = [NSISO8601DateFormatter new];
  NSDictionary *body = @{
    @"eventId": event[@"eventId"],
    @"schoolId": event[@"schoolId"],
    @"eventType": event[@"eventType"],
    @"latitude": event[@"latitude"],
    @"longitude": event[@"longitude"],
    @"accuracy": event[@"accuracy"],
    @"eventTime": [formatter stringFromDate:[NSDate dateWithTimeIntervalSince1970:[event[@"timestamp"] doubleValue] / 1000.0]],
  };
  request.HTTPBody = [NSJSONSerialization dataWithJSONObject:body options:0 error:nil];
  [[[NSURLSession sharedSession] dataTaskWithRequest:request
                                   completionHandler:^(__unused NSData *data, NSURLResponse *response, __unused NSError *error) {
    NSHTTPURLResponse *http = (NSHTTPURLResponse *)response;
    if (http.statusCode >= 200 && http.statusCode < 300) {
      [self markUploaded:event[@"eventId"]];
    }
  }] resume];
}

- (void)locationManager:(CLLocationManager *)manager didEnterRegion:(CLRegion *)region {
  [self recordTransition:@"ENTER" region:region];
}

- (void)locationManager:(CLLocationManager *)manager didExitRegion:(CLRegion *)region {
  [self recordTransition:@"EXIT" region:region];
}

- (void)locationManagerDidChangeAuthorization:(CLLocationManager *)manager {
  if (manager.authorizationStatus == kCLAuthorizationStatusAuthorizedAlways &&
      [[NSUserDefaults standardUserDefaults] boolForKey:kEnabledKey]) {
    manager.allowsBackgroundLocationUpdates = YES;
    [self restoreMonitoring];
  }
}

@end
