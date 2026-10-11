import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import {colors, spacing} from '../theme';

interface TrackingControlsProps {
  tracking: boolean;
  starting: boolean;
  onStart: () => void;
  onStop: () => void;
}

export function TrackingControls({
  tracking,
  starting,
  onStart,
  onStop,
}: TrackingControlsProps) {
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Start tracking"
        disabled={tracking || starting}
        onPress={onStart}
        style={({pressed}) => [
          styles.button,
          styles.start,
          (tracking || starting) && styles.disabled,
          pressed && !tracking && !starting && styles.pressed,
        ]}>
        {starting ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.primaryText}>Start Tracking</Text>
        )}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Stop tracking"
        disabled={!tracking || starting}
        onPress={onStop}
        style={({pressed}) => [
          styles.button,
          styles.stop,
          (!tracking || starting) && styles.disabled,
          pressed && tracking && styles.pressed,
        ]}>
        <Text style={styles.primaryText}>Stop Tracking</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  button: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  start: {
    backgroundColor: colors.primary,
  },
  stop: {
    backgroundColor: colors.danger,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.85,
  },
  primaryText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
});
