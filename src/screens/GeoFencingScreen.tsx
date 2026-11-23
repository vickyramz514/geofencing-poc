import {Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, View} from 'react-native';
import {useEffect, useMemo, useRef, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {SchoolMap} from '../components/SchoolMap';
import {TrackingControls} from '../components/TrackingControls';
import {OFFICE_ID, OFFICE_NAME} from '../data/office';
import {useDeliveryTracking} from '../hooks/useDeliveryTracking';
import {createAppServices} from '../services/createAppServices';
import {colors, spacing} from '../theme';
import type {OfficeLocation, School} from '../types';
import {formatCoordinate} from '../utils/format';

const SELECTED_OFFICE_KEY = 'geofence.selected-office.v1';

export function GeoFencingScreen({deviceId, deviceName, registrationNotice}: {deviceId: string; deviceName: string; registrationNotice?: string}) {
  const tracking = useDeliveryTracking({deviceId, deviceName});
  const api = useMemo(() => createAppServices().api, []);
  const [offices, setOffices] = useState<OfficeLocation[]>([]);
  const [selectedOfficeId, setSelectedOfficeId] = useState<string | null>(null);
  const [officePickerOpen, setOfficePickerOpen] = useState(false);
  const [officeLoadError, setOfficeLoadError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const startedAutomatically = useRef(false);
  useEffect(() => {
    let active = true;
    api.getOffices().then(async available => {
      let choices = available;
      if (!choices.length) {
        const fallback = await api.getOffice();
        if (fallback) choices = [fallback];
      }
      if (!active) return;
      setOffices(choices);
      const savedId = await AsyncStorage.getItem(SELECTED_OFFICE_KEY).catch(() => null);
      const selected = choices.find(office => office.id === savedId) || choices[0];
      setSelectedOfficeId(selected?.id || null);
      setOfficeLoadError(choices.length ? null : 'No active geofences are available.');
    }).catch(cause => {
      if (active) setOfficeLoadError(cause instanceof Error ? cause.message : 'Could not load geofences.');
    });
    return () => { active = false; };
  }, [api]);
  useEffect(() => {
    if (startedAutomatically.current || !selectedOfficeId) return;
    startedAutomatically.current = true;
    tracking.startTracking(selectedOfficeId).catch(() => undefined);
  }, [selectedOfficeId, tracking.startTracking]);
  const selectOffice = (office: OfficeLocation) => {
    setOfficePickerOpen(false);
    if (office.id === selectedOfficeId || tracking.trackingStatus === 'starting') return;
    setSelectedOfficeId(office.id || null);
    if (office.id) {
      AsyncStorage.setItem(SELECTED_OFFICE_KEY, office.id).catch(() => undefined);
      tracking.switchOffice(office.id).catch(() => undefined);
    }
  };
  const officeSchool: School | null = tracking.office
    ? {
        id: tracking.office.schoolId,
        name: tracking.officeName || OFFICE_NAME,
        address: 'Configured geofence',
        latitude: tracking.office.latitude,
        longitude: tracking.office.longitude,
        radiusMeters: tracking.office.radiusMeters,
        color: colors.primary,
        deliveryNote: '',
      }
    : null;
  const trackingOn = tracking.trackingStatus === 'tracking';

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      <SchoolMap
        schools={
          officeSchool
            ? [
                {
                  school: officeSchool,
                  presence: tracking.officePresence,
                },
              ]
            : []
        }
        location={tracking.location}
        selectedSchoolId={officeSchool?.id || OFFICE_ID}
        tracking={trackingOn}
        focus={tracking.office}
        fenceRadiusMeters={tracking.radiusMeters}
        onSelectSchool={() => undefined}
      />

      <SafeAreaView style={styles.overlay} edges={['top', 'left', 'right']} pointerEvents="box-none">
        <View style={styles.top} pointerEvents="box-none">
          <View pointerEvents="box-none" style={styles.details}>
            <Text accessibilityLabel={`Truck: ${deviceName}`} style={styles.deviceName}>🚚 {deviceName}</Text>
            <Pressable accessibilityRole="button" onPress={() => setOfficePickerOpen(true)} style={styles.officePickerButton}>
              <Text style={styles.officePickerLabel}>GEOFENCE</Text>
              <Text style={styles.officePickerName}>{tracking.officeName || offices.find(item => item.id === selectedOfficeId)?.name || 'Choose a geofence'}⌄</Text>
            </Pressable>
            <Text style={styles.coords}>
              {formatCoordinate(tracking.location?.latitude)},{' '}
              {formatCoordinate(tracking.location?.longitude)}
            </Text>
            {trackingOn && tracking.location && !tracking.accuracyAccepted ? (
              <Text style={styles.warning}>GPS accuracy is worse than 50 m.</Text>
            ) : null}
          </View>
        </View>
      </SafeAreaView>

      <View style={[styles.bottom, {paddingBottom: Math.max(insets.bottom, spacing.md)}]} pointerEvents="box-none">
        {officeLoadError && !offices.length ? (
          <View style={styles.bannerDanger}><Text style={styles.bannerBody}>{officeLoadError}</Text></View>
        ) : null}
        {registrationNotice ? (
          <View style={styles.bannerInfo}>
            <Text style={styles.bannerBody}>{registrationNotice}</Text>
          </View>
        ) : null}
        {tracking.permissionDenied ? (
          <View style={styles.bannerDanger}>
            <Text style={styles.bannerBody}>
              Location permission denied. Enable it in system settings, then start tracking.
            </Text>
          </View>
        ) : null}
        {tracking.errorMessage ? (
          <View style={styles.bannerDanger}>
            <Text style={styles.bannerBody}>{tracking.errorMessage}</Text>
          </View>
        ) : null}
        {tracking.notice ? (
          <View style={styles.bannerInfo}>
            <Text style={styles.bannerBody}>{tracking.notice}</Text>
          </View>
        ) : null}
        <TrackingControls
          tracking={trackingOn}
          starting={tracking.trackingStatus === 'starting'}
          onStart={() => {
            tracking.startTracking(selectedOfficeId || undefined).catch(() => undefined);
          }}
          onStop={tracking.stopTracking}
        />
      </View>
      <Modal visible={officePickerOpen} transparent animationType="fade" onRequestClose={() => setOfficePickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOfficePickerOpen(false)}>
          <Pressable style={styles.officePickerModal} onPress={() => undefined}>
            <Text style={styles.officePickerTitle}>Choose a geofence</Text>
            <Text style={styles.officePickerHint}>Truck entry and exit alerts use this geofence.</Text>
            <ScrollView style={styles.officeList}>
              {offices.map(office => (
                <Pressable key={office.id} onPress={() => selectOffice(office)} style={styles.officeOption}>
                  <View style={styles.officeOptionCopy}>
                    <Text style={styles.officeOptionName}>{office.name || 'Geofence'}</Text>
                    <Text style={styles.officeOptionMeta}>{office.radiusMeters} m geofence</Text>
                  </View>
                  {office.id === selectedOfficeId ? <Text style={styles.officeOptionSelected}>Selected</Text> : null}
                </Pressable>
              ))}
              {!offices.length ? <Text style={styles.officePickerHint}>{officeLoadError || 'Loading geofences…'}</Text> : null}
            </ScrollView>
            <Pressable onPress={() => setOfficePickerOpen(false)} style={styles.officePickerClose}><Text style={styles.officePickerCloseText}>Close</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 72,
  },
  top: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  details: {
    gap: spacing.sm,
  },
  coords: {
    alignSelf: 'flex-start',
    color: colors.text,
    backgroundColor: 'rgba(255,255,255,0.92)',
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: '600',
  },
  officePickerButton: {
    alignSelf: 'flex-start',
    minWidth: 180,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.96)',
    gap: 2,
  },
  officePickerLabel: {color: colors.primary, fontSize: 9, fontWeight: '800', letterSpacing: 1},
  officePickerName: {color: colors.text, fontSize: 13, fontWeight: '700'},
  modalBackdrop: {flex: 1, justifyContent: 'center', backgroundColor: 'rgba(18, 31, 42, 0.42)', padding: spacing.lg},
  officePickerModal: {maxHeight: '75%', borderRadius: 20, backgroundColor: colors.white, padding: spacing.lg, gap: spacing.sm},
  officePickerTitle: {color: colors.text, fontSize: 20, fontWeight: '800'},
  officePickerHint: {color: colors.muted, fontSize: 13, lineHeight: 18},
  officeList: {flexGrow: 0, marginTop: spacing.sm},
  officeOption: {minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E4E9EE', paddingVertical: spacing.sm},
  officeOptionCopy: {gap: 3, flex: 1},
  officeOptionName: {color: colors.text, fontSize: 15, fontWeight: '700'},
  officeOptionMeta: {color: colors.muted, fontSize: 12},
  officeOptionSelected: {color: colors.primary, fontSize: 12, fontWeight: '800'},
  officePickerClose: {alignItems: 'center', paddingVertical: spacing.sm},
  officePickerCloseText: {color: colors.primary, fontSize: 15, fontWeight: '700'},
  deviceName: {
    alignSelf: 'flex-start',
    color: colors.text,
    backgroundColor: 'rgba(255,255,255,0.92)',
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    fontSize: 13,
    fontWeight: '700',
  },
  warning: {
    alignSelf: 'flex-start',
    color: colors.warning,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 10,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: '700',
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  bannerDanger: {
    backgroundColor: 'rgba(253, 236, 236, 0.96)',
    borderRadius: 12,
    padding: spacing.md,
  },
  bannerInfo: {
    backgroundColor: 'rgba(232, 241, 251, 0.96)',
    borderRadius: 12,
    padding: spacing.md,
  },
  bannerBody: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
});
