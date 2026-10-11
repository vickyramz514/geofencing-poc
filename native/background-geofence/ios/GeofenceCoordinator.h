#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef void (^GeofenceEventHandler)(NSDictionary *event);

@interface GeofenceCoordinator : NSObject

+ (instancetype)shared;
- (void)startMonitoringRegions:(NSArray<NSDictionary *> *)regions apiBaseUrl:(NSString *)apiBaseUrl;
- (void)stopMonitoring;
- (NSArray<NSDictionary *> *)pendingEvents;
- (void)markUploaded:(NSString *)eventId;
- (void)setEventHandler:(nullable GeofenceEventHandler)handler;

@end

NS_ASSUME_NONNULL_END
