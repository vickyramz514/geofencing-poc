import {useState} from 'react';
import {Modal, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {colors, spacing} from '../theme';

interface RadiusPickerProps {
  value: number;
  options: number[];
  onChange: (meters: number) => void;
}

export function RadiusPicker({value, options, onChange}: RadiusPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Office radius, ${value} meters`}
        accessibilityHint="Opens a list of fence sizes from 50 meters to 1000 meters"
        onPress={() => setOpen(true)}
        style={({pressed}) => [styles.trigger, pressed && styles.pressed]}>
        <Text style={styles.label}>Radius</Text>
        <Text style={styles.value}>{value} m</Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable
            accessibilityLabel="Close radius list"
            style={styles.backdropPress}
            onPress={() => setOpen(false)}
          />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Office radius</Text>
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {options.map(option => {
                const selected = option === value;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityState={{selected}}
                    onPress={() => {
                      onChange(option);
                      setOpen(false);
                    }}
                    style={({pressed}) => [
                      styles.option,
                      selected && styles.optionSelected,
                      pressed && styles.pressed,
                    ]}>
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                      {option} m
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 999,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    paddingVertical: 6,
  },
  pressed: {
    opacity: 0.85,
  },
  label: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  value: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  chevron: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
    marginTop: -1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(16, 24, 40, 0.35)',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  backdropPress: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  sheet: {
    zIndex: 1,
    maxHeight: '70%',
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingVertical: spacing.md,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  list: {
    flexGrow: 0,
  },
  option: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  optionSelected: {
    backgroundColor: colors.primarySoft,
  },
  optionText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  optionTextSelected: {
    color: colors.primaryDark,
    fontWeight: '800',
  },
});
