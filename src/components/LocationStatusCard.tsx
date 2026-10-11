import {StyleSheet, Text, View} from 'react-native';
import type {LocationFix, TrackingStatus} from '../types';
import {colors, spacing} from '../theme';
import {
  formatAccuracy,
  formatCoordinate,
  formatHeading,
  formatTimestamp,
} from '../utils/format';

interface LocationStatusCardProps {
  location: LocationFix | null;
  trackingStatus: TrackingStatus;
  isOnline: boolean;
  pendingCount: number;
  lastSuccessAt: string | null;
  accuracyAccepted: boolean;
  geofencingLabel: string;
}

const TRACKING_LABEL: Record<TrackingStatus, string> = {
  idle: 'Idle',
  starting: 'Starting',
  tracking: 'Tracking',
  stopped: 'Stopped',
};

export function LocationStatusCard({
  location,
  trackingStatus,
  isOnline,
  pendingCount,
  lastSuccessAt,
  accuracyAccepted,
  geofencingLabel,
}: LocationStatusCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Location</Text>
      <View style={styles.grid}>
        <StatusItem label="Latitude" value={formatCoordinate(location?.latitude)} />
        <StatusItem label="Longitude" value={formatCoordinate(location?.longitude)} />
        <StatusItem label="GPS accuracy" value={formatAccuracy(location?.accuracy)} />
        <StatusItem label="Heading" value={formatHeading(location?.heading)} />
        <StatusItem label="Tracking" value={TRACKING_LABEL[trackingStatus]} />
        <StatusItem label="Network" value={isOnline ? 'Online' : 'Offline'} />
        <StatusItem label="Pending updates" value={String(pendingCount)} />
        <StatusItem
          label="Geofencing"
          value={geofencingLabel}
        />
      </View>
      <Text style={styles.meta}>
        Last successful API update: {formatTimestamp(lastSuccessAt)}
      </Text>
      {location && trackingStatus === 'tracking' && !accuracyAccepted ? (
        <Text style={styles.warning}>
          GPS accuracy is worse than 50 m. Entry and exit detection is waiting for a better fix.
        </Text>
      ) : null}
    </View>
  );
}

function StatusItem({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.item}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.md,
  },
  heading: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  item: {
    width: '47%',
    gap: 2,
  },
  label: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  value: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  warning: {
    color: colors.warning,
    backgroundColor: colors.warningSoft,
    borderRadius: 10,
    overflow: 'hidden',
    padding: spacing.md,
    fontSize: 13,
    lineHeight: 18,
  },
});
