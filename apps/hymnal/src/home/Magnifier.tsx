/** The find bar's search mark beyond iOS: a ring and its handle, in the accent. */

import { StyleSheet, View } from 'react-native';

import { useAccent } from '~/color';

export function Magnifier() {
  const accent = useAccent();
  return (
    <View style={styles.mark} aria-hidden>
      <View style={[styles.ring, { borderColor: accent }]} />
      <View style={[styles.handle, { backgroundColor: accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { width: 22, height: 22 },
  ring: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  handle: {
    position: 'absolute',
    top: 15,
    left: 13,
    width: 8,
    height: 2.5,
    borderRadius: 1.25,
    transform: [{ rotate: '45deg' }],
  },
});
