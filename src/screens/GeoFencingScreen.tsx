import {StatusBar, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {SchoolMap} from '../components/SchoolMap';
import {TrackingControls} from '../components/TrackingControls';
import {OFFICE_ID, OFFICE_NAME, OFFICE_RADIUS_METERS} from '../data/office';
import {useDeliveryTracking} from '../hooks/useDeliveryTracking';
import {colors, spacing} from '../theme';
import type {Presence, School} from '../types';
import {formatCoordinate, formatDistance} from '../utils/format';

function presenceCopy(presence: Presence | 'unknown', hasOffice: boolean, tracking: boolean): string {
  if (!hasOffice) {
    return tracking ? 'Getting your location…' : 'Start tracking to set the office area.';
  }
  if (presence === 'outside') {
    return 'You are outside the office area.';
  }
  return 'You are inside the office area.';
}

export function GeoFencingScreen() {
  const tracking = useDeliveryTracking();
  const insets = useSafeAreaInsets();
  const officeSchool: School | null = tracking.office
    ? {
        id: OFFICE_ID,
        name: OFFICE_NAME,
        address: '200 m around the location captured when tracking started',
        latitude: tracking.office.latitude,
        longitude: tracking.office.longitude,
        radiusMeters: tracking.office.radiusMeters,
        color: colors.primary,
        deliveryNote: '',
      }
    : null;
  const trackingOn = tracking.trackingStatus === 'tracking';
  const outside = tracking.office != null && tracking.officePresence === 'outside';
  const inside = tracking.office != null && !outside;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      <SchoolMap
        schools={
          officeSchool
            ? [
                {
                  school: officeSchool,
                  distanceMeters: tracking.distanceMeters,
                  presence: tracking.officePresence,
                },
              ]
            : []
        }
        location={tracking.location}
        selectedSchoolId={OFFICE_ID}
        tracking={trackingOn}
        focus={tracking.office}
        onSelectSchool={() => undefined}
      />

      <SafeAreaView style={styles.overlay} edges={['top', 'left', 'right']} pointerEvents="box-none">
        <View style={styles.top} pointerEvents="none">
          <Text style={styles.coords}>
            {formatCoordinate(tracking.location?.latitude)},{' '}
            {formatCoordinate(tracking.location?.longitude)}
          </Text>
          <View
            style={[
              styles.status,
              outside ? styles.statusOutside : inside ? styles.statusInside : styles.statusWaiting,
            ]}>
            <Text style={styles.statusLabel}>
              {!tracking.office ? 'Office area' : outside ? 'Outside' : 'Inside'}
            </Text>
            <Text style={styles.statusBody}>
              {presenceCopy(tracking.officePresence, tracking.office != null, trackingOn)}
            </Text>
            {officeSchool ? (
              <Text style={styles.statusMeta}>
                {formatDistance(tracking.distanceMeters)} from center · {OFFICE_RADIUS_METERS} m
              </Text>
            ) : null}
          </View>
          {trackingOn && tracking.location && !tracking.accuracyAccepted ? (
            <Text style={styles.warning}>GPS accuracy is worse than 50 m.</Text>
          ) : null}
        </View>
      </SafeAreaView>

      <View style={[styles.bottom, {paddingBottom: Math.max(insets.bottom, spacing.md)}]} pointerEvents="box-none">
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
            tracking.startTracking().catch(() => undefined);
          }}
          onStop={tracking.stopTracking}
        />
      </View>
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
  status: {
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  statusWaiting: {
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  statusInside: {
    backgroundColor: 'rgba(229, 244, 239, 0.96)',
  },
  statusOutside: {
    backgroundColor: 'rgba(255, 244, 232, 0.96)',
  },
  statusLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  statusBody: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
  statusMeta: {
    color: colors.muted,
    fontSize: 12,
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
