import { One } from 'one';
import { type ColorValue, StyleSheet } from 'react-native';

export function Magnifier({ tint }: { readonly tint: ColorValue }) {
  return (
    <One.iOS.Image
      systemName="magnifyingglass"
      swiftStyle={{ foregroundStyle: tint, imageScale: 'medium' }}
      style={styles.mark}
    />
  );
}

const styles = StyleSheet.create({ mark: { width: 22, height: 22 } });
