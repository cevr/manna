import { useAtom } from '@effect/atom-react';
import { Clock, Option } from 'effect';
import { createContext, memo, use, useMemo, useRef, useState } from 'react';
import { type ColorValue, StyleSheet, Text, View } from 'react-native';

import { color } from '~/color';
import { plain, useCue } from '~/feel/cue';
import { book } from '~/follow/book';
import type { Timeline } from '~/follow/timeline';
import { settings } from '~/store';

import { Chip } from './Chip';
import { DialPanel } from './DialPanel';
import { DialView, MOST_SCALE } from './DialView';
import {
  type Beat,
  beatOf,
  bpmAt,
  bpmOf,
  DEFAULT_TEMPO,
  saidOf,
  stopAt,
  stopIndexOf,
  STOPS,
  tap,
  type TapRun,
} from './tempo';

export const TapClock = createContext<Clock.Clock>(Clock.Clock.defaultValue());

export const TempoDial = memo(function TempoDial({ number }: { readonly number: number }) {
  const [tempo, setTempo] = useAtom(settings.tempo(number));
  const first = useMemo(() => Option.map(book.of(number), (timeline) => timeline.tempo), [number]);
  const cue = useCue();
  const [resets, setResets] = useState(0);
  const away = tempo !== DEFAULT_TEMPO;
  const reset = () => {
    cue(plain('reset'));
    setTempo(DEFAULT_TEMPO);
    setResets((count) => count + 1);
  };
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
          resets={resets}
        />
      </DialPanel>
      {(Option.isSome(first) || away) && (
        <View style={styles.beatRow}>
          {Option.match(first, {
            onNone: () => <></>,
            onSome: (hymnTempo) => <BpmReadOut first={hymnTempo} tempo={tempo} />,
          })}
          <View style={styles.chips}>
            {away && <ResetChip onPress={reset} />}
            {Option.match(first, {
              onNone: () => <></>,
              onSome: (hymnTempo) => <TapChip hymnBpm={bpmOf(hymnTempo)} onTempo={setTempo} />,
            })}
          </View>
        </View>
      )}
    </View>
  );
});

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

const FLAGS: ReadonlyMap<number, number> = new Map([
  [8, 1],
  [16, 2],
]);

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

function TapChip({
  hymnBpm,
  onTempo,
}: {
  readonly hymnBpm: number;
  readonly onTempo: (tempo: number) => void;
}) {
  const clock = use(TapClock);
  const cue = useCue();
  const run = useRef<TapRun>([]);
  const press = () => {
    const at = clock.currentTimeMillisUnsafe();
    cue(plain('press'));
    const tapped = tap(run.current, at, hymnBpm);
    run.current = tapped.run;
    for (const tempo of Option.toArray(tapped.tempo)) onTempo(tempo);
  };
  return (
    <Chip
      testID="tempo-tap"
      label="Tap"
      hint="Tap four times at the beat to set the tempo"
      onPress={press}
    >
      Tap
    </Chip>
  );
}

function ResetChip({ onPress }: { readonly onPress: () => void }) {
  return (
    <Chip testID="tempo-reset" label="Reset tempo" hint="Back to 100%" onPress={onPress}>
      {`↺ ${saidOf(DEFAULT_TEMPO)}`}
    </Chip>
  );
}

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
  chips: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto' },
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
