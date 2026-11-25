import {useCallback, useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Platform, Pressable, StatusBar, StyleSheet, Text, TextInput, View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {GeoFencingScreen} from './src/screens/GeoFencingScreen';
import {createAppServices} from './src/services/createAppServices';
import {colors, spacing} from './src/theme';

const DEVICE_PROFILE_KEY = 'geofence.device-profile.v1';
type DeviceProfile = {deviceId: string; deviceName: string};

function newDeviceId(): string {
  return `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function DeviceSetup({onRegistered}: {onRegistered: (profile: DeviceProfile) => void}) {
  const api = useMemo(() => createAppServices().api, []);
  const [deviceName, setDeviceName] = useState('');
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(DEVICE_PROFILE_KEY).then(raw => {
      if (raw) {
        try {
          const profile = JSON.parse(raw) as DeviceProfile;
          if (profile.deviceId && profile.deviceName) {
            setDeviceId(profile.deviceId);
            setDeviceName(profile.deviceName);
            return;
          }
        } catch {
          // Replace an invalid saved profile with a new device ID.
        }
      }
      setDeviceId(newDeviceId());
    }).catch(() => setDeviceId(newDeviceId()));
  }, []);

  const register = useCallback(async () => {
    const cleanName = deviceName.trim();
    if (!deviceId || !cleanName) return;
    setBusy(true);
    setError(null);
    const profile = {deviceId, deviceName: cleanName};
    try {
      await api.registerDevice({...profile, platform: Platform.OS === 'ios' ? 'ios' : 'android'});
      await AsyncStorage.setItem(DEVICE_PROFILE_KEY, JSON.stringify(profile));
      onRegistered(profile);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Truck registration failed. Check the API connection and retry.');
    } finally {
      setBusy(false);
    }
  }, [api, deviceId, deviceName, onRegistered]);

  return (
    <View style={styles.setup}>
      <StatusBar barStyle="light-content" backgroundColor="#081628" />
      <View style={styles.card}>
        <Text style={styles.eyebrow}>TRUCK TRACKING</Text>
        <Text style={styles.title}>Register a truck</Text>
        <Text style={styles.description}>Enter a truck name or number to identify it on the live map.</Text>
        <TextInput
          accessibilityLabel="Truck name or number"
          value={deviceName}
          onChangeText={setDeviceName}
          placeholder="Truck name or number"
          placeholderTextColor="#acc3db"
          maxLength={60}
          style={styles.input}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={() => void register()}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable disabled={busy || !deviceId || !deviceName.trim()} onPress={() => void register()} style={({pressed}) => [styles.button, (busy || !deviceId || !deviceName.trim()) && styles.disabled, pressed && styles.pressed]}>
          {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Register and open map</Text>}
        </Pressable>
        {!deviceId ? <Text style={styles.helper}>Preparing device ID…</Text> : null}
      </View>
    </View>
  );
}

function App() {
  const [profile, setProfile] = useState<DeviceProfile | null>(null);
  const [checkingRegistration, setCheckingRegistration] = useState(true);
  const [registrationNotice, setRegistrationNotice] = useState<string | undefined>();
  const api = useMemo(() => createAppServices().api, []);
  const handleRegistered = useCallback((registered: DeviceProfile) => { setProfile(registered); setRegistrationNotice('Truck registered'); }, []);
  useEffect(() => {
    AsyncStorage.getItem(DEVICE_PROFILE_KEY).then(async raw => {
      if (!raw) return;
      const saved = JSON.parse(raw) as DeviceProfile;
      if (!saved.deviceId || !saved.deviceName) return;
      const existing = await api.getRegisteredDevice(saved.deviceId);
      if (existing) {
        const registered = {...saved, deviceName: existing.deviceName || saved.deviceName};
        setProfile(registered);
        setRegistrationNotice('Truck already registered');
        return;
      }
      await api.registerDevice({...saved, platform: Platform.OS === 'ios' ? 'ios' : 'android'});
      setProfile(saved);
      setRegistrationNotice('Truck registered');
    }).catch(() => undefined).finally(() => setCheckingRegistration(false));
  }, [api]);
  return (
    <SafeAreaProvider>
      {profile ? <GeoFencingScreen deviceId={profile.deviceId} deviceName={profile.deviceName} registrationNotice={registrationNotice} /> : checkingRegistration ? (
        <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.helper}>Registering truck…</Text></View>
      ) : <DeviceSetup onRegistered={handleRegistered} />}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  setup: {flex: 1, backgroundColor: '#081628', justifyContent: 'center', padding: spacing.lg},
  loading: {flex: 1, backgroundColor: '#081628', justifyContent: 'center', alignItems: 'center', gap: spacing.md},
  card: {backgroundColor: '#102741', borderColor: '#325777', borderWidth: 1, borderRadius: 22, padding: spacing.lg, gap: spacing.md, elevation: 3},
  eyebrow: {color: '#16c4ff', fontSize: 12, fontWeight: '800', letterSpacing: 1.2},
  title: {color: '#f4f8ff', fontSize: 26, fontWeight: '800'},
  description: {color: '#acc3db', fontSize: 15, lineHeight: 22},
  input: {minHeight: 52, borderWidth: 1, borderColor: '#325777', borderRadius: 12, paddingHorizontal: spacing.md, color: '#f4f8ff', fontSize: 16},
  button: {minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#008cef', paddingHorizontal: spacing.md},
  buttonText: {color: colors.white, fontSize: 16, fontWeight: '700'},
  disabled: {opacity: 0.5},
  pressed: {opacity: 0.82},
  error: {color: '#ff8796', fontSize: 14, lineHeight: 20},
  helper: {color: '#acc3db', fontSize: 13},
});

export default App;
