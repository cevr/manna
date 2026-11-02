/**
 * The player's chip: a pill 32 points high, whatever it holds, with a hit
 * area of 44 (the slop), its width following its words. The 13-point word at
 * the dials' largest text (1.3) fits in it. A `mark` drawn before the word
 * (the Tuner's fork) sits in a row with it. The chip is a button named
 * `label`; its words are what it shows.
 */

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { color } from '~/color';

import { MOST_SCALE } from './DialView';

export function Chip({
  testID,
  label,
  hint,
  mark,
  onPress,
  children,
}: {
  readonly testID: string;
  readonly label: string;
  readonly hint: string;
  readonly mark?: ReactNode;
  readonly onPress: () => void;
  readonly children: string;
}) {
  return (
    <Pressable
      testID={testID}
      role="button"
      aria-label={label}
      accessibilityHint={hint}
      hitSlop={SLOP}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
    >
      {mark}
      <Text style={styles.text} numberOfLines={1} maxFontSizeMultiplier={MOST_SCALE}>
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
    paddingHorizontal: 12,
    borderRadius: 16,
    justifyContent: 'center',
    backgroundColor: color.pill,
  },
  pressed: { opacity: 0.6 },
  text: { fontSize: 13, fontWeight: '600', color: color.onPill },
});
