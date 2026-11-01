/** The find bar's search mark on iOS: the SF Symbol `magnifyingglass`, in the accent. */

import { One } from 'one';
import { StyleSheet } from 'react-native';

import { useAccent } from '~/color';

export function Magnifier() {
  const accent = useAccent();
  return (
    <One.iOS.Image
      systemName="magnifyingglass"
      swiftStyle={{ foregroundStyle: accent, imageScale: 'medium' }}
      style={styles.mark}
    />
  );
}

const styles = StyleSheet.create({ mark: { width: 22, height: 22 } });
