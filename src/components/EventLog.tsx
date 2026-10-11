import {StyleSheet, Text, View} from 'react-native';
import type {GeofenceEvent} from '../types';
import {colors, spacing} from '../theme';
import {formatTimestamp} from '../utils/format';

interface EventLogProps {
  events: GeofenceEvent[];
  schoolNameById: Record<string, string>;
  title?: string;
}

const UPLOAD_LABEL = {
  pending: 'Pending upload',
  uploaded: 'Uploaded',
  failed: 'Upload failed',
} as const;

export function EventLog({events, schoolNameById, title = 'Event history'}: EventLogProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>{title}</Text>
      {events.length === 0 ? (
        <Text style={styles.empty}>
          No geofence events yet. Start tracking and move into a school boundary to record an entry.
        </Text>
      ) : (
        events.map(event => (
          <View key={event.eventId} style={styles.row}>
            <View
              style={[
                styles.badge,
                event.eventType === 'ENTER' ? styles.enter : styles.exit,
              ]}>
              <Text style={styles.badgeText}>{event.eventType}</Text>
            </View>
            <View style={styles.copy}>
              <Text style={styles.school}>
                {schoolNameById[event.schoolId] ?? event.schoolId}
              </Text>
              <Text style={styles.meta}>
                {formatTimestamp(event.eventTime)} · {Math.round(event.accuracy)} m accuracy
              </Text>
              <Text style={styles.meta}>
                {UPLOAD_LABEL[event.uploadStatus]}
                {event.serverReceivedAt
                  ? ` · Server ${formatTimestamp(event.serverReceivedAt)}`
                  : ''}
              </Text>
            </View>
          </View>
        ))
      )}
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
  empty: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    minWidth: 64,
    alignItems: 'center',
  },
  enter: {
    backgroundColor: colors.primarySoft,
  },
  exit: {
    backgroundColor: colors.warningSoft,
  },
  badgeText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  school: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  meta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
});
