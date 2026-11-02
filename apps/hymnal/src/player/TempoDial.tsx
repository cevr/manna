/**
 * A hymn's tempo in the player sheet: a stopping dial over the stops, 50 %
 * to 150 % in steps of 5 % (`tempo.ts`), each drawn as its number, the
 * percent read out. Each turn is kept under the hymn's `tempo.<n>` key, and
 * the player keeps it at once (`playerOn`'s `tempoFor`): with Sound on the
 * recording plays at it with its pitch kept, with Sound off the score clock
 * runs at it, and the follow keeps step either way.
 *
 * Under the dial, a row reads the hymn's beat and its bpm at the dial's
 * tempo (`♩ = 90`, one label for VoiceOver: `quarter note = 90`), counted
 * from the hymn's first tempo as the timing bundle carries it. A hymn whose
 * timing does not decode draws no read-out, and the dial is as it is.
 */

import { useAtom } from '@effect/atom-react';
import { Option } from 'effect';
import { memo, useMemo } from 'react';
import { type ColorValue, StyleSheet, Text, View } from 'react-native';

import { color } from '~/color';
import { book } from '~/follow/book';
import type { Timeline } from '~/follow/timeline';
import { settings } from '~/store';

import { DialPanel } from './DialPanel';
import { DialView, MOST_SCALE } from './DialView';
import { type Beat, beatOf, bpmAt, bpmOf, saidOf, stopAt, stopIndexOf, STOPS } from './tempo';

export const TempoDial = memo(function TempoDial({ number }: { readonly number: number }) {
  const [tempo, setTempo] = useAtom(settings.tempo(number));
  const first = useMemo(() => Option.map(book.of(number), (timeline) => timeline.tempo), [number]);
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
      {Option.match(first, {
        onNone: () => <></>,
        onSome: (hymnTempo) => (
          <View style={styles.beatRow}>
            <BpmReadOut first={hymnTempo} tempo={tempo} />
          </View>
        ),
      })}
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

/**
 * The hymn's beat and its bpm at the dial's `tempo`: the beat's note drawn,
 * then `= <bpm>`. VoiceOver reads it as one element, the note named.
 */
function BpmReadOut({
  first,
  tempo,
}: {
  readonly first: Timeline['tempo'];
  readonly tempo: number;
}) {
  const beat = beatOf(first);
  const bpm = bpmAt(bpmOf(first), tempo);
  return (
    <View testID="tempo-bpm" accessible aria-label={`${beat.name} = ${bpm}`} style={styles.readOut}>
      <NoteMark beat={beat} tint={color.ink} />
      <Text style={styles.bpm} numberOfLines={1} maxFontSizeMultiplier={MOST_SCALE}>
        {` = ${bpm}`}
      </Text>
    </View>
  );
}

/** Flags on a note's stem, by the denominator that writes it: an eighth has one, a sixteenth two. */
const FLAGS: ReadonlyMap<number, number> = new Map([
  [8, 1],
  [16, 2],
]);

/**
 * A beat's note drawn with Views, in a box 14 points wide and 18 tall, in
 * `tint`: an oval head, open for a whole or half note, filled for shorter
 * ones; a stem for all but the whole note; a flag on it for each eighth's
 * halving; a dot after the head for a dotted note. Hidden from VoiceOver:
 * the read-out's label names the note.
 */
function NoteMark({ beat, tint }: { readonly beat: Beat; readonly tint: ColorValue }) {
  const flags = Option.getOrElse(Option.fromUndefinedOr(FLAGS.get(beat.note)), () => 0);
  return (
    <View aria-hidden testID="mark-note" style={styles.note}>
      <View
        style={[
          styles.head,
          { backgroundColor: tint, borderColor: tint },
          beat.note <= 2 && styles.open,
        ]}
      />
      {beat.note >= 2 && <View style={[styles.stem, { backgroundColor: tint }]} />}
      {Array.from({ length: flags }, (_, k) => (
        <View key={k} style={[styles.flag, { top: 1 + 4 * k, borderColor: tint }]} />
      ))}
      {beat.dotted && <View style={[styles.dot, { backgroundColor: tint }]} />}
    </View>
  );
}

/** The note mark's strokes: thin, as the read-out's semibold figures. */
const STROKE = 1.5;

const styles = StyleSheet.create({
  section: { gap: 8 },
  mark: { fontSize: 15, lineHeight: 17, fontWeight: '700', color: color.muted },
  current: { color: color.chord },
  beatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  readOut: { flexDirection: 'row', alignItems: 'center' },
  bpm: {
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    color: color.ink,
  },
  note: { width: 14, height: 18 },
  head: {
    position: 'absolute',
    left: 0,
    top: 12,
    width: 8,
    height: 6,
    borderRadius: 4,
    transform: [{ rotate: '-20deg' }],
  },
  open: { backgroundColor: 'transparent', borderWidth: STROKE },
  stem: { position: 'absolute', left: 8 - STROKE, top: 1, width: STROKE, height: 14 },
  flag: {
    position: 'absolute',
    left: 8 - STROKE,
    width: 4,
    height: 6,
    borderTopWidth: STROKE,
    borderRightWidth: STROKE,
    borderTopRightRadius: 4,
  },
  dot: {
    position: 'absolute',
    left: 10,
    top: 14,
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
});
