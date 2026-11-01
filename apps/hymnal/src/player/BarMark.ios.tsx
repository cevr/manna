/**
 * A player bar button's mark on iOS: an SF Symbol, 22 points, in `tint`. A
 * speaker with waves while sound is on, with a slash while it is off; play,
 * pause, again (a counter-clockwise arrow) and retry (a clockwise one); a
 * tuning fork for the key panel's Tuner chip.
 */

import { Match } from 'effect';
import { One } from 'one';
import { type ColorValue, StyleSheet } from 'react-native';

import type { Mark } from './button';

/** The bar's marks: its buttons' and Sound's (`Mark`), and the tuning fork of the key panel's Tuner chip, which opens a route rather than commanding the player. */
type Drawn = Mark | 'tuner';

export function BarMark({ mark, tint }: { readonly mark: Drawn; readonly tint: ColorValue }) {
  return (
    <One.iOS.Image
      systemName={symbolOf(mark)}
      swiftStyle={{ foregroundStyle: tint, imageScale: 'large' }}
      testID={`mark-${mark}`}
      style={styles.mark}
    />
  );
}

const symbolOf = Match.type<Drawn>().pipe(
  Match.when('sound-on', () => 'speaker.wave.2.fill' as const),
  Match.when('sound-off', () => 'speaker.slash.fill' as const),
  Match.when('play', () => 'play.fill' as const),
  Match.when('pause', () => 'pause.fill' as const),
  Match.when('again', () => 'arrow.counterclockwise' as const),
  Match.when('retry', () => 'arrow.clockwise' as const),
  Match.when('tuner', () => 'tuningfork' as const),
  Match.exhaustive,
);

const styles = StyleSheet.create({ mark: { width: 22, height: 22 } });
