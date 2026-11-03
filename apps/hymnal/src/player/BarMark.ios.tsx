import { Match } from 'effect';
import { One } from 'one';
import { type ColorValue, StyleSheet } from 'react-native';

import type { Mark } from './button';

export function BarMark({ mark, tint }: { readonly mark: Mark; readonly tint: ColorValue }) {
  return (
    <One.iOS.Image
      systemName={symbolOf(mark)}
      swiftStyle={{ foregroundStyle: tint, imageScale: 'large' }}
      testID={`mark-${mark}`}
      style={styles.mark}
    />
  );
}

const symbolOf = Match.type<Mark>().pipe(
  Match.when('sound-on', () => 'speaker.wave.2.fill' as const),
  Match.when('sound-off', () => 'speaker.slash.fill' as const),
  Match.when('play', () => 'play.fill' as const),
  Match.when('pause', () => 'pause.fill' as const),
  Match.when('again', () => 'arrow.counterclockwise' as const),
  Match.when('retry', () => 'arrow.clockwise' as const),
  Match.exhaustive,
);

const styles = StyleSheet.create({ mark: { width: 22, height: 22 } });
