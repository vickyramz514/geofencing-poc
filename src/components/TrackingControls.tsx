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
          <Text style={styles.primaryText}>▶  Start Tracking</Text>
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
        <Text style={styles.primaryText}>■  Stop</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  button: {
    minHeight: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  start: {
    backgroundColor: '#008cef',
  },
  stop: {
    backgroundColor: '#182f47',
    borderColor: '#466381',
    borderWidth: 1,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.85,
  },
  primaryText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
});
