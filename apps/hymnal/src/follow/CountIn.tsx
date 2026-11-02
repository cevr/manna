/**
 * The count-in's pulse over line 0 (`IntroLine.tsx` draws it in line 0's
 * box): while the player holds the page's hymn at its first sung line and
 * counts one bar in (`player.countIn`, `src/player/countin.ts`), a row of
 * one mark per beat, drawn absolutely just above line 0 so the line keeps
 * its place. Each mark takes the accent as its beat comes and keeps it; the
 * newly lit one pulses by scale, which Reduce Motion drops (colour is not
 * motion, scale is). It is a progress bar, `Count-in`, read as `Beat <k> of
 * <n>`, with no live region: a screen reader is not read every beat.
 *
 * With the reader's `Click` on, each new beat is told as a `beat` cue
 * (`src/feel/cue.ts`), the first the accent; `Sounds and haptics` decides
 * whether it is heard (`feelOver`). Nothing is told as the pulse mounts, for
 * a beat given again, or for the count-in's end.
 */

import { RegistryContext } from '@effect/atom-react';
import { Array as Arr, Option } from 'effect';
import { use, useEffect, useRef } from 'react';
import { Animated, type ColorValue, Easing, Platform, StyleSheet, View } from 'react-native';

import { color, useAccent } from '~/color';
import { useCue } from '~/feel/cue';
import type { Beat } from '~/player/countin';
import { useReduceMotion } from '~/player/motion';
import { settings } from '~/store';

import { useCountIn } from './follow';

/** How far the newly lit mark grows, and how long it takes to settle back, ms. */
const PULSE = { from: 1.6, ms: 150 } as const;

export function CountIn() {
  const { beat, onBeat } = useCountIn();
  const tell = useCue();
  const registry = use(RegistryContext);
  useEffect(
    () =>
      onBeat(({ index }) => {
        if (registry.get(settings.click)) tell({ _tag: 'beat', accent: index === 0 });
      }),
    [onBeat, tell, registry],
  );
  return Option.match(beat, {
    onNone: () => <></>,
    onSome: (at) => <Pulse beat={at} />,
  });
}

function Pulse({ beat }: { readonly beat: Beat }) {
  const accent = useAccent();
  const reduced = useReduceMotion();
  return (
    <View
      accessible
      role="progressbar"
      aria-label="Count-in"
      aria-valuemin={0}
      aria-valuemax={beat.of}
      aria-valuenow={beat.index + 1}
      aria-valuetext={`Beat ${beat.index + 1} of ${beat.of}`}
      testID="count-in"
      style={styles.row}
    >
      {Arr.makeBy(beat.of, (m) => (
        <Mark
          key={m}
          paint={paintOf(m <= beat.index, accent)}
          fresh={m === beat.index}
          reduced={reduced}
        />
      ))}
    </View>
  );
}

function Mark({
  paint,
  fresh,
  reduced,
}: {
  readonly paint: ColorValue;
  readonly fresh: boolean;
  readonly reduced: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!fresh || reduced) return () => {};
    scale.setValue(PULSE.from);
    const run = Animated.timing(scale, {
      toValue: 1,
      duration: PULSE.ms,
      easing: Easing.out(Easing.quad),
      useNativeDriver: Platform.OS !== 'web',
    });
    run.start();
    return () => run.stop();
  }, [fresh, reduced, scale]);
  const style = [styles.mark, { backgroundColor: paint }];
  if (reduced) return <Animated.View testID="count-in-mark" style={style} />;
  return <Animated.View testID="count-in-mark" style={[...style, { transform: [{ scale }] }]} />;
}

/** A mark lit takes the accent; one still to come, the hairline's colour. */
const paintOf = (lit: boolean, accent: ColorValue): ColorValue => {
  if (lit) return accent;
  return color.line;
};

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    left: 0,
    top: -18,
    flexDirection: 'row',
    gap: 6,
  },
  mark: { width: 8, height: 8, borderRadius: 4 },
});
