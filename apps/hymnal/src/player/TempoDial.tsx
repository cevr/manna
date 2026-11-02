/**
 * A hymn's tempo in the player sheet: a stopping dial over the stops, 50 %
 * to 150 % in steps of 5 % (`tempo.ts`), each drawn as its number, the
 * percent read out. Each turn is kept under the hymn's `tempo.<n>` key, and
 * the player keeps it at once (`playerOn`'s `tempoFor`): with Sound on the
 * recording plays at it with its pitch kept, with Sound off the score clock
 * runs at it, and the follow keeps step either way.
 */

import { useAtom } from '@effect/atom-react';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color } from '~/color';
import { settings } from '~/store';

import { DialPanel } from './DialPanel';
import { DialView, MOST_SCALE } from './DialView';
import { saidOf, stopAt, stopIndexOf, STOPS } from './tempo';

export const TempoDial = memo(function TempoDial({ number }: { readonly number: number }) {
  const [tempo, setTempo] = useAtom(settings.tempo(number));
  return (
    <View style={styles.section}>
      <DialPanel>
        <DialView
          dial="tempo"
          testID="dial-tempo"
          label="Tempo"
          title="TEMPO"
          stops={STOPS}
          index={stopIndexOf(tempo)}
          wrap={false}
          said={saidOf(tempo)}
          drawStop={(stop, current) => <TempoMark stop={stop} current={current} />}
          onTurn={(to) => setTempo(stopAt(to))}
        />
      </DialPanel>
    </View>
  );
});

/** A stop of the dial: its percent, the one at the notch in the chord colour. */
function TempoMark({ stop, current }: { readonly stop: number; readonly current: boolean }) {
  return (
    <Text
      aria-hidden
      numberOfLines={1}
      maxFontSizeMultiplier={MOST_SCALE}
      style={[styles.mark, current && styles.current]}
    >
      {stop}
    </Text>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  mark: { fontSize: 15, lineHeight: 17, fontWeight: '700', color: color.muted },
  current: { color: color.chord },
});
