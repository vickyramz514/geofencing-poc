import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {EventLog} from '../components/EventLog';
import {LocationStatusCard} from '../components/LocationStatusCard';
import {SchoolCard} from '../components/SchoolCard';
import {SchoolMap} from '../components/SchoolMap';
import {TrackingControls} from '../components/TrackingControls';
import {useDeliveryTracking} from '../hooks/useDeliveryTracking';
import {colors, spacing} from '../theme';
import {DELIVERY_STATUS_LABEL} from '../utils/deliveryStatus';
import {formatDistance} from '../utils/format';

export function GeoFencingScreen() {
  const tracking = useDeliveryTracking();
  const schoolNameById = Object.fromEntries(
    tracking.schools.map(item => [item.school.id, item.school.name]),
  );
  const selectedEvents = tracking.events.filter(
    event => event.schoolId === tracking.selectedSchool.school.id,
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{tracking.route.name}</Text>
          <Text style={styles.title}>School deliveries</Text>
          <Text style={styles.subtitle}>
            GPS detects school entry and exit while the app is open. Start Tracking also registers
            native regions for when the app is closed, after background location is allowed.
            Arrival, delivery, and fitting stay separate actions.
          </Text>
          <Text style={styles.mode}>
            {tracking.useMockApi
              ? 'Mock mode — API calls are simulated on this device.'
              : `Live API — ${tracking.apiBaseUrl}`}
          </Text>
        </View>

        <TrackingControls
          tracking={tracking.trackingStatus === 'tracking'}
          starting={tracking.trackingStatus === 'starting'}
          onStart={() => {
            tracking.startTracking().catch(() => undefined);
          }}
          onStop={tracking.stopTracking}
        />

        {tracking.permissionDenied ? (
          <View style={styles.bannerDanger}>
            <Text style={styles.bannerTitle}>Location permission denied</Text>
            <Text style={styles.bannerBody}>
              GeoFencePOC needs location access while the app is open. Enable it in system settings,
              then press Start Tracking.
            </Text>
          </View>
        ) : null}

        {tracking.errorMessage ? (
          <View style={styles.bannerDanger}>
            <Text style={styles.bannerTitle}>Something needs attention</Text>
            <Text style={styles.bannerBody}>{tracking.errorMessage}</Text>
          </View>
        ) : null}

        {tracking.notice ? (
          <View style={styles.bannerInfo}>
            <Text style={styles.bannerBody}>{tracking.notice}</Text>
          </View>
        ) : null}

        <LocationStatusCard
          location={tracking.location}
          trackingStatus={tracking.trackingStatus}
          isOnline={tracking.isOnline}
          pendingCount={tracking.pendingCount}
          lastSuccessAt={tracking.lastSuccessAt}
          accuracyAccepted={tracking.accuracyAccepted}
          geofencingLabel={tracking.geofencingLabel}
        />

        <SchoolMap
          schools={tracking.schools}
          location={tracking.location}
          selectedSchoolId={tracking.selectedSchool.school.id}
          tracking={tracking.trackingStatus === 'tracking'}
          onSelectSchool={tracking.selectSchool}
        />

        <View style={styles.detail}>
          <Text style={styles.section}>Selected school</Text>
          <Text style={styles.detailName}>{tracking.selectedSchool.school.name}</Text>
          <Text style={styles.detailMeta}>{tracking.selectedSchool.school.address}</Text>
          <Text style={styles.detailMeta}>
            Radius {tracking.selectedSchool.school.radiusMeters} m ·{' '}
            {formatDistance(tracking.selectedSchool.distanceMeters)} ·{' '}
            {DELIVERY_STATUS_LABEL[tracking.selectedSchool.status]}
          </Text>
          <Text style={styles.detailMeta}>
            {tracking.selectedSchool.school.latitude.toFixed(6)},{' '}
            {tracking.selectedSchool.school.longitude.toFixed(6)}
          </Text>
        </View>

        <Text style={styles.section}>Schools</Text>
        {tracking.schools.length === 0 ? (
          <Text style={styles.empty}>No schools are configured for this route.</Text>
        ) : (
          tracking.schools.map(item => (
            <SchoolCard
              key={item.school.id}
              school={item.school}
              distanceMeters={item.distanceMeters}
              presence={item.presence}
              status={item.status}
              arrivalSuggested={item.arrivalSuggested}
              selected={item.school.id === tracking.selectedSchool.school.id}
              busy={tracking.busySchoolId === item.school.id}
              onSelect={() => tracking.selectSchool(item.school.id)}
              onAdvance={status => {
                tracking.advanceDelivery(item.school.id, status).catch(() => undefined);
              }}
            />
          ))
        )}

        <EventLog
          events={selectedEvents}
          schoolNameById={schoolNameById}
          title={`${tracking.selectedSchool.school.name} events`}
        />
        <EventLog events={tracking.events} schoolNameById={schoolNameById} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  header: {
    gap: spacing.sm,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21,
  },
  mode: {
    alignSelf: 'flex-start',
    backgroundColor: colors.infoSoft,
    color: colors.info,
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '700',
  },
  bannerDanger: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 14,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  bannerInfo: {
    backgroundColor: colors.infoSoft,
    borderRadius: 14,
    padding: spacing.lg,
  },
  bannerTitle: {
    color: colors.danger,
    fontWeight: '800',
    fontSize: 15,
  },
  bannerBody: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  section: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  detail: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  detailName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  detailMeta: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  empty: {
    color: colors.muted,
    fontSize: 14,
  },
});
