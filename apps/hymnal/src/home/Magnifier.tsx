import { type ColorValue, StyleSheet, View } from 'react-native';

export function Magnifier({ tint }: { readonly tint: ColorValue }) {
  return (
    <View style={styles.mark} aria-hidden>
      <View style={[styles.ring, { borderColor: tint }]} />
      <View style={[styles.handle, { backgroundColor: tint }]} />
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
