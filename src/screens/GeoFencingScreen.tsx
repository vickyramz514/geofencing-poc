import {Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, View} from 'react-native';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {SchoolMap} from '../components/SchoolMap';
import {TrackingControls} from '../components/TrackingControls';
import {OFFICE_ID, OFFICE_NAME} from '../data/office';
import {useDeliveryTracking} from '../hooks/useDeliveryTracking';
import {createAppServices} from '../services/createAppServices';
import {colors, spacing} from '../theme';
import type {LocationFix, OfficeLocation, School} from '../types';
import {formatCoordinate} from '../utils/format';

const SELECTED_OFFICE_KEY = 'geofence.selected-office.v1';

export function GeoFencingScreen({deviceId, deviceName, registrationNotice}: {deviceId: string; deviceName: string; registrationNotice?: string}) {
  const tracking = useDeliveryTracking({deviceId, deviceName});
  const api = useMemo(() => createAppServices().api, []);
  const [offices, setOffices] = useState<OfficeLocation[]>([]);
  const [selectedOfficeId, setSelectedOfficeId] = useState<string | null>(null);
  const [officePickerOpen, setOfficePickerOpen] = useState(false);
  const [officeLoadError, setOfficeLoadError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'Fleet' | 'Alerts' | null>(null);
  const [trail, setTrail] = useState<LocationFix[]>([]);
  const [fitRequest, setFitRequest] = useState(0);
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

  const saveFix = useCallback((fix: LocationFix) => {
    setTrail(previous => {
      const last = previous[previous.length - 1];
      if (last && last.latitude === fix.latitude && last.longitude === fix.longitude) return previous;
      return [...previous.slice(-199), fix];
    });
  }, []);
  useEffect(() => {
    if (!trackingOn) {
      setTrail(previous => previous.length ? [] : previous);
    } else if (tracking.location && tracking.accuracyAccepted) {
      saveFix(tracking.location);
    }
  }, [trackingOn, tracking.location, tracking.accuracyAccepted, saveFix]);
  const geofenceName = tracking.officeName || offices.find(item => item.id === selectedOfficeId)?.name || 'Choose geofence';
  const presence = tracking.officePresence === 'inside' ? 'Inside geofence' : tracking.officePresence === 'outside' ? 'Outside geofence' : 'Waiting for GPS';
  const tabs = [
    {label: 'Overview', icon: '⌂', action: () => setSheet(null)},
    {label: 'Fleet', icon: '▣', action: () => setSheet('Fleet')},
    {label: 'Alerts', icon: '♧', action: () => setSheet('Alerts')},
    {label: 'Navigate', icon: '➤', action: () => {setSheet(null); setFitRequest(value => value + 1);}},
  ];

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <View style={styles.header}>
        <View style={styles.brand}>
          <Text style={styles.brandIcon}>🚚</Text>
          <View style={styles.brandCopy}>
            <Text style={styles.brandTitle}>Truck<Text style={styles.accent}>Tracking</Text></Text>
            <Text style={styles.meta}>Fleet &amp; Geofence Management</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Truck profile" onPress={() => setSheet('Fleet')} style={styles.avatar}><Text style={styles.accent}>{deviceName.slice(0, 2).toUpperCase()}</Text></Pressable>
        </View>
        <View style={styles.stats}>
          {[
            {label: 'Trucks', value: 1, tone: '#29baff', icon: '▣'},
            {label: 'Active', value: Number(trackingOn), tone: '#2be79a', icon: '●'},
            {label: 'Idle', value: Number(!trackingOn), tone: '#ffc253', icon: 'Ⅱ'},
            {label: 'Alerts', value: tracking.events.length, tone: '#ff677a', icon: '⚠'},
          ].map(item => (
            <View key={item.label} style={[styles.stat, item.label === 'Trucks' && styles.primaryStat]}>
              <Text style={styles.statValue}><Text style={{color: item.tone}}>{item.icon}</Text> {item.value}</Text>
              <Text style={styles.statLabel}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.mapStage}>
        <SchoolMap
          schools={officeSchool ? [{school: officeSchool, presence: tracking.officePresence}] : []}
          location={tracking.location}
          selectedSchoolId={officeSchool?.id || OFFICE_ID}
          tracking={trackingOn}
          focus={tracking.office}
          fenceRadiusMeters={tracking.radiusMeters}
          deviceName={deviceName}
          trail={trail}
          fitRequest={fitRequest}
          onSelectSchool={() => setOfficePickerOpen(true)}
        />
        <View style={styles.mapTop} pointerEvents="box-none">
          <View style={styles.filters}>
            <Pressable accessibilityRole="button" onPress={() => setSheet('Fleet')} style={styles.filter}>
              <Text style={styles.meta}>Fleet</Text>
              <Text numberOfLines={1} style={styles.filterName}>{deviceName} ⌄</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setOfficePickerOpen(true)} style={[styles.filter, styles.fenceFilter]}>
              <Text style={styles.meta}>Geofence</Text>
              <Text numberOfLines={1} style={styles.filterName}>{geofenceName} ⌄</Text>
            </Pressable>
          </View>
          <View style={styles.coords}>
            <Text style={styles.filterName}>⌖  {tracking.location ? `${formatCoordinate(tracking.location.latitude)}, ${formatCoordinate(tracking.location.longitude)}` : 'Waiting for GPS'}</Text>
            {tracking.location ? <Text style={[styles.meta, !tracking.accuracyAccepted && styles.warning]}>● Accuracy ±{Math.round(tracking.location.accuracy)} m</Text> : null}
          </View>
        </View>
        <View style={styles.legend} pointerEvents="none">
          <Text style={styles.legendText}><Text style={styles.accent}>▣ </Text>Truck</Text>
          <Text style={styles.legendText}><Text style={styles.accent}>━ </Text>Route trail</Text>
          <Text style={styles.legendText}><Text style={styles.accent}>◯ </Text>Geofence</Text>
          <Text style={styles.legendText}><Text style={styles.accent}>◉ </Text>GPS</Text>
        </View>
      </View>

      <View style={styles.bottom}>
        {officeLoadError && !offices.length ? (
          <View style={styles.bannerDanger}><Text style={styles.bannerBody}>{officeLoadError}</Text></View>
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
        <View style={styles.trackingCard}>
          <Text style={styles.check}>✓</Text>
          <View style={styles.brandCopy}>
            <Text style={styles.filterName}>{registrationNotice || 'Truck registered'}</Text>
            <Text style={styles.meta}>{presence} · {trackingOn ? 'Live tracking' : 'Tracking paused'}</Text>
          </View>
          <TrackingControls
            tracking={trackingOn}
            starting={tracking.trackingStatus === 'starting'}
            onStart={() => {
              tracking.startTracking(selectedOfficeId || undefined).catch(() => undefined);
            }}
            onStop={tracking.stopTracking}
          />
        </View>
      </View>
      <View style={[styles.nav, {paddingBottom: Math.max(insets.bottom, spacing.sm)}]}>
        {tabs.map(tab => {
          const selected = (sheet || 'Overview') === tab.label;
          return <Pressable key={tab.label} accessibilityRole="button" accessibilityState={{selected}} onPress={tab.action} style={styles.tab}>
            <Text style={[styles.tabIcon, selected && styles.accent]}>{tab.icon}</Text>
            <Text style={[styles.tabLabel, selected && styles.accent]}>{tab.label}{tab.label === 'Alerts' && tracking.events.length ? ` (${tracking.events.length})` : ''}</Text>
          </Pressable>;
        })}
      </View>
      <Modal visible={sheet !== null} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.officePickerModal}>
            <Text style={styles.officePickerTitle}>{sheet}</Text>
            {sheet === 'Fleet' ? <>
              <Text style={styles.officeOptionName}>{deviceName}</Text>
              <Text style={styles.meta}>{trackingOn ? 'Live tracking' : 'Tracking paused'} · {geofenceName}</Text>
            </> : <ScrollView style={styles.officeList}>
              {tracking.events.length ? tracking.events.slice().reverse().map(event => (
                <View key={event.eventId} style={styles.officeOption}>
                  <Text style={styles.officeOptionName}>{event.eventType === 'ENTER' ? 'Entered geofence' : 'Exited geofence'}</Text>
                  <Text style={styles.meta}>{new Date(event.eventTime).toLocaleTimeString()}</Text>
                </View>
              )) : <Text style={styles.meta}>No geofence alerts in this session.</Text>}
            </ScrollView>}
            <Pressable accessibilityRole="button" onPress={() => setSheet(null)} style={styles.officePickerClose}><Text style={styles.officePickerCloseText}>Close</Text></Pressable>
          </View>
        </View>
      </Modal>
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
    </SafeAreaView>
  );
}

const panel = {backgroundColor: '#102741', borderColor: '#325777', borderWidth: 1};

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#081628'},
  header: {paddingHorizontal: 10, paddingBottom: 10, gap: 12},
  brand: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4, paddingVertical: 5},
  brandIcon: {backgroundColor: '#06396a', fontSize: 25, padding: 7, borderRadius: 12},
  brandCopy: {flex: 1, gap: 2},
  brandTitle: {color: '#f4f8ff', fontSize: 24, fontWeight: '800', letterSpacing: -0.8},
  accent: {color: '#16c4ff'},
  meta: {color: '#acc3db', fontSize: 12},
  avatar: {...panel, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center'},
  stats: {flexDirection: 'row', gap: 6},
  stat: {...panel, flex: 1, borderRadius: 12, paddingVertical: 7, alignItems: 'center', gap: 2},
  primaryStat: {backgroundColor: '#09366b', borderColor: '#077deb'},
  statValue: {color: '#f4f8ff', fontSize: 19, fontWeight: '800'},
  statLabel: {color: '#e0edff', fontSize: 11},
  mapStage: {flex: 1, minHeight: 140, backgroundColor: '#102741'},
  mapTop: {position: 'absolute', top: 10, left: 10, right: 64, alignItems: 'flex-start', gap: 8},
  filters: {...panel, flexDirection: 'row', borderRadius: 13, paddingVertical: 8, backgroundColor: 'rgba(15, 42, 68, 0.95)'},
  filter: {flex: 1, paddingHorizontal: 10, gap: 2},
  fenceFilter: {borderLeftWidth: 1, borderLeftColor: '#325777'},
  filterName: {color: '#f4f8ff', fontSize: 13, fontWeight: '700'},
  coords: {...panel, borderRadius: 12, paddingVertical: 6, paddingHorizontal: 10, gap: 2},
  warning: {color: '#ffc253'},
  legend: {...panel, position: 'absolute', bottom: 9, alignSelf: 'center', maxWidth: '95%', borderRadius: 24, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 9, paddingVertical: 7, paddingHorizontal: 12},
  legendText: {color: '#ebf5ff', fontSize: 11},
  bottom: {padding: 6, gap: 5},
  trackingCard: {...panel, borderRadius: 15, padding: 8, flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 5, alignItems: 'center'},
  check: {color: '#45f3a1', borderColor: '#17c883', borderWidth: 1, borderRadius: 15, width: 27, height: 27, textAlign: 'center', lineHeight: 24, fontSize: 17},
  nav: {flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#325777', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 4},
  tab: {flex: 1, alignItems: 'center', minHeight: 45},
  tabIcon: {fontSize: 22, color: '#b3c8df'},
  tabLabel: {fontSize: 11, color: '#f4f8ff'},
  modalBackdrop: {flex: 1, justifyContent: 'center', backgroundColor: '#020811bd', padding: spacing.lg},
  officePickerModal: {...panel, maxHeight: '75%', borderRadius: 20, padding: spacing.lg, gap: spacing.sm},
  officePickerTitle: {color: '#f4f8ff', fontSize: 20, fontWeight: '800'},
  officePickerHint: {color: '#acc3db', fontSize: 13, lineHeight: 18},
  officeList: {flexGrow: 0, marginTop: spacing.sm},
  officeOption: {minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#294464', paddingVertical: spacing.sm, gap: 8},
  officeOptionCopy: {gap: 3, flex: 1},
  officeOptionName: {color: '#f4f8ff', fontSize: 14, fontWeight: '700', flexShrink: 1},
  officeOptionMeta: {color: '#acc3db', fontSize: 12},
  officeOptionSelected: {color: '#16c4ff', fontSize: 12, fontWeight: '800'},
  officePickerClose: {alignItems: 'center', paddingVertical: spacing.sm},
  officePickerCloseText: {color: '#16c4ff', fontSize: 15, fontWeight: '700'},
  bannerDanger: {backgroundColor: '#492334', borderRadius: 8, padding: 8},
  bannerInfo: {backgroundColor: '#123354', borderRadius: 8, padding: 8},
  bannerBody: {color: '#f4f8ff', fontSize: 12},
});
