import {StatusBar} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {GeoFencingScreen} from './src/screens/GeoFencingScreen';
import {colors} from './src/theme';

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <GeoFencingScreen />
    </SafeAreaProvider>
  );
}

export default App;
