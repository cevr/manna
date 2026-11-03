import { type ColorValue, StyleSheet, View } from 'react-native';

export function TunerMark({ tint }: { readonly tint: ColorValue }) {
  return (
    <View aria-hidden testID="mark-tuner" style={styles.mark}>
      <View style={[styles.prongs, { borderColor: tint }]} />
      <View style={[styles.stem, { backgroundColor: tint }]} />
    </View>
  );
}

const STROKE = 1.5;

const styles = StyleSheet.create({
  mark: { width: 10, height: 14 },
  prongs: {
    position: 'absolute',
    left: 1,
    top: 0,
    width: 8,
    height: 9,
    borderLeftWidth: STROKE,
    borderRightWidth: STROKE,
    borderBottomWidth: STROKE,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  stem: {
    position: 'absolute',
    left: 5 - STROKE / 2,
    top: 8.5,
    width: STROKE,
    height: 5.5,
    borderRadius: STROKE / 2,
  },
});
