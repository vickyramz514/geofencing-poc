import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import type {DeliveryStatus, Presence, School} from '../types';
import {colors, spacing} from '../theme';
import {DELIVERY_STATUS_LABEL, nextDeliveryStatus} from '../utils/deliveryStatus';
import {formatDistance} from '../utils/format';

interface SchoolCardProps {
  school: School;
  distanceMeters: number | null;
  presence: Presence | 'unknown';
  status: DeliveryStatus;
  arrivalSuggested: boolean;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onAdvance: (status: DeliveryStatus) => void;
}

const ACTION_LABEL: Partial<Record<DeliveryStatus, string>> = {
  PENDING: 'Start transit',
  IN_TRANSIT: 'Confirm arrival',
  ARRIVED: 'Confirm delivery',
  DELIVERED: 'Start fitting',
  FITTING_IN_PROGRESS: 'Complete fitting',
};

function presenceCopy(presence: Presence | 'unknown'): string {
  if (presence === 'inside') {
    return 'Inside geofence';
  }
  if (presence === 'outside') {
    return 'Outside geofence';
  }
  return 'Waiting for GPS';
}

export function SchoolCard({
  school,
  distanceMeters,
  presence,
  status,
  arrivalSuggested,
  selected,
  busy,
  onSelect,
  onAdvance,
}: SchoolCardProps) {
  const nextStatus = nextDeliveryStatus(status);
  const actionLabel = ACTION_LABEL[status];

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onSelect}
      style={[styles.card, selected && styles.selected]}>
      <View style={styles.header}>
        <View style={[styles.swatch, {backgroundColor: school.color}]} />
        <View style={styles.titleBlock}>
          <Text style={styles.name}>{school.name}</Text>
          <Text style={styles.address}>{school.address}</Text>
        </View>
      </View>
      <Text style={styles.note}>{school.deliveryNote}</Text>
      <View style={styles.pills}>
        <Text style={styles.pill}>{DELIVERY_STATUS_LABEL[status]}</Text>
        <Text
          style={[
            styles.pill,
            presence === 'inside' ? styles.inside : styles.neutral,
          ]}>
          {presenceCopy(presence)}
        </Text>
        <Text style={styles.pill}>{formatDistance(distanceMeters)}</Text>
      </View>
      {arrivalSuggested ? (
        <Text style={styles.suggestion}>
          Entered the geofence. Confirm arrival separately. This does not mark the order delivered.
        </Text>
      ) : null}
      {nextStatus && actionLabel ? (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => onAdvance(nextStatus)}
          style={({pressed}) => [
            styles.action,
            arrivalSuggested && styles.actionEmphasis,
            pressed && styles.pressed,
            busy && styles.disabled,
          ]}>
          {busy ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.actionText}>{actionLabel}</Text>
          )}
        </Pressable>
      ) : (
        <Text style={styles.complete}>Fitting completed</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
  },
  selected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  header: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  swatch: {
    width: 12,
    height: 40,
    borderRadius: 6,
  },
  titleBlock: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  address: {
    color: colors.muted,
    fontSize: 13,
  },
  note: {
    color: colors.text,
    fontSize: 13,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pill: {
    backgroundColor: colors.background,
    color: colors.text,
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: '700',
  },
  inside: {
    backgroundColor: colors.primary,
    color: colors.white,
  },
  neutral: {
    backgroundColor: colors.background,
  },
  suggestion: {
    color: colors.warning,
    backgroundColor: colors.warningSoft,
    borderRadius: 10,
    overflow: 'hidden',
    padding: spacing.md,
    fontSize: 13,
    lineHeight: 18,
  },
  action: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  actionEmphasis: {
    backgroundColor: colors.primaryDark,
  },
  actionText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 15,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.6,
  },
  complete: {
    color: colors.primary,
    fontWeight: '700',
  },
});
