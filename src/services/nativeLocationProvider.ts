import Geolocation from '@react-native-community/geolocation';
import {PermissionsAndroid, Platform} from 'react-native';
import type {LocationProvider} from './LocationTrackingService';
import {locationErrorFromCode} from './LocationTrackingService';

export function createNativeLocationProvider(): LocationProvider {
  return {
    async requestAuthorization() {
      Geolocation.setRNConfiguration({
        skipPermissionRequests: false,
        authorizationLevel: 'whenInUse',
        locationProvider: 'auto',
        enableBackgroundLocationUpdates: false,
      });

      if (Platform.OS === 'android') {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location permission',
            message:
              'GeoFencePOC uses your location while the app is open to track school deliveries and detect arrival.',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
          },
        );
        if (result === PermissionsAndroid.RESULTS.GRANTED) {
          return 'granted';
        }
        return 'denied';
      }

      return new Promise(resolve => {
        Geolocation.requestAuthorization(
          () => resolve('granted'),
          () => resolve('denied'),
        );
      });
    },

    watchPosition(success, error, options) {
      return Geolocation.watchPosition(
        position => {
          const heading = position.coords.heading;
          success({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            heading: heading != null && heading >= 0 ? heading : null,
            timestamp: position.timestamp,
          });
        },
        geoError => {
          error(locationErrorFromCode(geoError.code, geoError.message));
        },
        options,
      );
    },

    clearWatch(watchId) {
      Geolocation.clearWatch(watchId);
    },
  };
}

export async function requestBackgroundLocation(): Promise<'granted' | 'denied'> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 29) {
    return 'granted';
  }
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
    {
      title: 'Background location',
      message:
        'Allow all the time so GeoFencePOC can detect school entry and exit after the app is closed.',
      buttonPositive: 'Allow',
      buttonNegative: 'Keep while in use',
    },
  );
  return result === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied';
}
