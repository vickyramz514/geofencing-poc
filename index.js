/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { geofenceHeadlessTask } from './src/background/geofenceHeadlessTask';

AppRegistry.registerComponent(appName, () => App);
AppRegistry.registerHeadlessTask('GeofenceBackgroundTask', () => geofenceHeadlessTask);
