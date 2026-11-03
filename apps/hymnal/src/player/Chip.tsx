import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { color } from '~/color';

import { MOST_SCALE } from './DialView';

export function Chip({
  testID,
  label,
  hint,
  mark,
  checked,
  onPress,
  children,
}: {
  readonly testID: string;
  readonly label: string;
  readonly hint: string;
  readonly mark?: ReactNode;
  readonly checked?: boolean;
  readonly onPress: () => void;
  readonly children: string;
}) {
  return (
    <Pressable
      testID={testID}
      role="button"
      aria-label={label}
      aria-checked={checked}
      accessibilityHint={hint}
      hitSlop={SLOP}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, checked && styles.chosen, pressed && styles.pressed]}
    >
      {mark}
      <Text
        style={[styles.text, checked && styles.onChosen]}
        numberOfLines={1}
        maxFontSizeMultiplier={MOST_SCALE}
      >
        {children}
      </Text>
    </Pressable>
  );
}

const HEIGHT = 32;
const SLOP = { top: 6, bottom: 6 };

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: HEIGHT,
    minWidth: 44,
    paddingHorizontal: 12,
    borderRadius: 16,
    justifyContent: 'center',
    backgroundColor: color.pill,
  },
  chosen: { backgroundColor: color.chosen },
  pressed: { opacity: 0.6 },
  text: { fontSize: 13, fontWeight: '600', color: color.onPill },
  onChosen: { color: color.onChosen },
});
