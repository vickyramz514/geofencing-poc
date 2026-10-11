import {resolveEnvironment, type AppEnvironment} from '../config/environment';
import {createApiClient, type ApiClient} from './ApiService';
import {ForegroundGeofencingService} from './GeofencingService';
import {LocationTrackingService} from './LocationTrackingService';
import {LocationUploadService} from './LocationUploadService';
import {createNativeLocationProvider} from './nativeLocationProvider';
import {OfflineQueueService} from './OfflineQueueService';
import {keychainSecureStorage} from './SecureStorageService';
import {asyncStorageAdapter} from './storage';

export interface AppServices {
  environment: AppEnvironment;
  api: ApiClient;
  queue: OfflineQueueService;
  geofencing: ForegroundGeofencingService;
  location: LocationTrackingService;
  upload: LocationUploadService;
}

export function createAppServices(): AppServices {
  const environment = resolveEnvironment();
  const queue = new OfflineQueueService(asyncStorageAdapter);
  const api = createApiClient({
    baseUrl: environment.apiBaseUrl,
    useMock: environment.useMockApi,
    getAuthToken: () => keychainSecureStorage.getToken(),
  });
  const upload = new LocationUploadService(api, queue);
  return {
    environment,
    api,
    queue,
    geofencing: new ForegroundGeofencingService(),
    location: new LocationTrackingService(createNativeLocationProvider()),
    upload,
  };
}
