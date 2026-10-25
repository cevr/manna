/**
 * The key and capo dials, over the bar or in the player sheet, and the
 * model they share with the bar's key button (`thumb.ts`), bound to the
 * stores: chords on or off for every hymn, and the page's hymn's move. The
 * key dial turns through the twelve sounding keys and wraps, the printed
 * key marked; the capo dial runs from 0 to 11 and stops at each end, each
 * fret over the key played there, the open keys marked. While the move is
 * not the hymn as printed, a chip resets it: the printed key, no capo, and
 * the dials closed. A double tap on either dial does the same.
 *
 * Nothing here holds the player: a turn, a reset or a hold never reaches
 * the sound.
 */

import * as Chord from '@bible/hymnal/chord';
import { useAtom, useAtomValue } from '@effect/atom-react';
import { Option } from 'effect';
import { createContext, use, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color, useAccent } from '~/color';
import { useCue } from '~/feel/cue';
import { hasChords, keyName, type Move, soundingKey } from '~/hymns/chords';
import { styled } from '~/hymns/simple';
import type { ChordReader } from '~/reader/HymnPage';
import { reader } from '~/reader/screen';

import { DialView } from './DialView';
import {
  capoSaid,
  type CapoStop,
  capoStops,
  keySaid,
  type KeyStop,
  keyStops,
  shownOf,
  step,
  type Thumb,
  ThumbEvent,
} from './thumb';

/** What the dials read and set: the app's own stores, or a test's. */
export const ChordReaderContext = createContext<ChordReader>(reader);

/** The key model of hymn `number`'s page, bound to the stores, and its printed key if it has chords. */
export const useThumb = (number: number) => {
  const chordReader = use(ChordReaderContext);
  const [chords, setChords] = useAtom(chordReader.chords);
  const [move, setMove] = useAtom(chordReader.move(number));
  const style = useAtomValue(chordReader.style);
  const book = useMemo(() => chordReader.book.of(number), [chordReader.book, number]);
  const printed = useMemo(
    () =>
      book.pipe(
        Option.filter(hasChords),
        Option.map((c) => styled(c, style).key),
      ),
    [book, style],
  );
  const [open, setOpen] = useState(false);
  const cue = useCue();
  // Events that come before the page draws again (a fling's detents) each step from the last.
  const now = useRef<Thumb>({ chords, move, open });
  now.current = { chords, move, open };
  const send = (event: ThumbEvent) => {
    // A hymn with no chords opens no dials: a hold still turns chords on or off.
    const key = Option.orElse(printed, () => Option.liftPredicate(noKey, () => keyless(event)));
    for (const printedKey of Option.toArray(key)) {
      const next = step(printedKey, now.current, event);
      const was = now.current;
      now.current = next.state;
      if (next.state.chords !== was.chords) setChords(next.state.chords);
      if (!sameMove(next.state.move, was.move)) setMove(next.state.move);
      if (next.state.open !== was.open) setOpen(next.state.open);
      for (const told of next.cues) cue(told);
    }
  };
  return { printed, state: { chords, move, open }, send };
};

export type BoundThumb = ReturnType<typeof useThumb>;

/** The key a hold steps from on a hymn with no chords: a hold reads none. */
const noKey: Chord.Key = { tonic: 'C', minor: false };

/** The events a hymn with no chords takes: a hold, and a tap on the page. */
const keyless = (event: ThumbEvent) =>
  ThumbEvent.$is('Hold')(event) || ThumbEvent.$is('TapPage')(event);

const sameMove = (a: Move, b: Move) => a.transpose === b.transpose && a.capo === b.capo;

/** The dials `thumb` shows (`shownOf`), top to bottom, for a hymn printed in `printed`. */
export function Dials({
  thumb,
  printed,
}: {
  readonly thumb: BoundThumb;
  readonly printed: Chord.Key;
}) {
  const { state, send } = thumb;
  const keys = useMemo(() => keyStops(printed), [printed]);
  const frets = useMemo(() => capoStops(printed, state.move), [printed, state.move]);
  const reset = () => send(ThumbEvent.Reset());
  return (
    <View testID="dials" style={styles.dials} pointerEvents="box-none">
      {shownOf(state).map((shown) => {
        if (shown === 'reset') return <ResetChip key="reset" printed={printed} onPress={reset} />;
        if (shown === 'capo')
          return (
            <DialView<CapoStop>
              key="capo"
              testID="dial-capo"
              label="Capo"
              title="CAPO"
              stops={frets}
              index={state.move.capo}
              wrap={false}
              said={capoSaid(printed, state.move)}
              drawStop={(stop, current) => <Fret stop={stop} current={current} />}
              onTurn={(capo) => send(ThumbEvent.TurnCapo({ capo }))}
              onReset={reset}
            />
          );
        return (
          <DialView<KeyStop>
            key="key"
            testID="dial-key"
            label="Key"
            title="KEY"
            stops={keys}
            index={Chord.pitchClass(soundingKey(printed, state.move).tonic)}
            wrap
            said={keySaid(printed, state.move)}
            drawStop={(stop, current) => <KeyName stop={stop} current={current} />}
            onTurn={(pitch) => send(ThumbEvent.TurnKey({ pitch }))}
            onReset={reset}
          />
        );
      })}
    </View>
  );
}

/** Reset, while the move is not the hymn as printed: "↺ Db, no capo". */
function ResetChip({
  printed,
  onPress,
}: {
  readonly printed: Chord.Key;
  readonly onPress: () => void;
}) {
  const label = `↺ ${keyName(printed)}, no capo`;
  return (
    <Pressable
      role="button"
      aria-label="Reset"
      accessibilityHint={`Back to ${keyName(printed)}, with no capo`}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
    >
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

/** A key on the key dial: the printed key marked with a dot under it. */
function KeyName({ stop, current }: { readonly stop: KeyStop; readonly current: boolean }) {
  const accent = useAccent();
  return (
    <>
      <Text style={[styles.key, current && { color: accent }]}>{stop.name}</Text>
      {stop.printed && <View style={[styles.home, { backgroundColor: accent }]} />}
    </>
  );
}

/** A fret on the capo dial: its number over the key played there, an open key in the accent. */
function Fret({ stop, current }: { readonly stop: CapoStop; readonly current: boolean }) {
  const accent = useAccent();
  return (
    <>
      <Text style={[styles.fret, current && { color: accent }]}>{stop.capo}</Text>
      <Text style={[styles.played, stop.open && [styles.open, { color: accent }]]}>
        {stop.played}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  dials: { gap: 8, alignItems: 'stretch' },
  chip: {
    alignSelf: 'center',
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    justifyContent: 'center',
    backgroundColor: color.soft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
  },
  pressed: { opacity: 0.6 },
  chipText: { fontSize: 13, fontWeight: '600', color: color.ink },
  key: { fontSize: 15, fontWeight: '600', color: color.ink },
  home: { position: 'absolute', bottom: 5, width: 4, height: 4, borderRadius: 2, opacity: 0.7 },
  fret: { fontSize: 15, lineHeight: 16, fontWeight: '700', color: color.ink },
  played: { fontSize: 10, lineHeight: 12, color: color.muted },
  open: { fontWeight: '700' },
});
