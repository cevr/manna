/**
 * The key and capo dials, over the bar or in the player sheet, and the
 * model they share with the bar's key button (`thumb.ts`), bound to the
 * stores: chords on or off for every hymn, and the page's hymn's move. The
 * key dial turns through the twelve sounding keys and wraps, the printed
 * key marked; the capo dial runs from 0 to 11 and stops at each end, each
 * fret over the key played there, the open keys marked. While the move is
 * not the hymn as printed, a chip resets it: the printed key and no capo. A
 * double tap on either dial does the same. On the hymn page's dials, on a
 * device with the ear, a Tuner chip leads the top row and opens the tuner.
 *
 * Over the bar a reset turns both rows home where the reader sees them,
 * and the dials close `RESET_WAIT` ms after it. Any touch of the reader's
 * in that wait (a dial, the key button, the page) ends it: a dial touched
 * keeps the dials open, a tap on the key button closes them at once. A page
 * turn and the page's going end it too. In the player sheet the dials stay.
 * No dials stand while chords are off: turned off anywhere, they close.
 *
 * The held hymn's sounding key is observed by the player while chords are
 * on; with chords off it plays as printed (`heardMove`). Capo changes only
 * the reading; it never reaches the recording.
 */

import * as Chord from '@manna/hymnal/chord';
import { useAtom, useAtomValue } from '@effect/atom-react';
import { Clock, Duration, Effect, Fiber, Match, Option } from 'effect';
import {
  createContext,
  memo,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'one';

import { color } from '~/color';
import { useCue } from '~/feel/cue';
import { hasChords, keyName, type Move, soundingKey } from '~/hymns/chords';
import { styled } from '~/hymns/simple';
import type { ChordReader } from '~/reader/HymnPage';
import { reader } from '~/reader/screen';

import { Chip } from './Chip';
import { PanelRow, ROW_GAP } from './DialPanel';
import { DialView, MOST_SCALE } from './DialView';
import {
  capoSaid,
  type CapoStop,
  capoStops,
  chipsOf,
  isStill,
  keySaid,
  type KeyStop,
  keyStops,
  shownOf,
  step,
  type Thumb,
  ThumbEvent,
} from './thumb';
import { TunerMark } from './TunerMark';

/** What the dials read and set: the app's own stores, or a test's. */
export const ChordReaderContext = createContext<ChordReader>(reader);

/** How long the dials stay open over the bar after a reset: the turn home (300 ms), then the reader sees it rest. */
export const RESET_WAIT = 600;

/**
 * The clock a reset's wait for its close runs on: the live clock, or a
 * test's `TestClock`, which moves the wait without real time passing.
 */
export const ResetClock = createContext<Clock.Clock>(Clock.Clock.defaultValue());

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
  const [resets, setResets] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const [openOn, setOpenOn] = useState(number);
  if (openOn !== number) {
    setOpenOn(number);
    setOpen(false);
    setWaiting(false);
  }
  if (open && !chords) {
    setOpen(false);
    setWaiting(false);
  }
  const cue = useCue();
  const clock = use(ResetClock);
  const now = useRef<Thumb>({ chords, move, open });
  now.current = { chords, move, open };
  const apply = (event: ThumbEvent) => {
    const key = Option.orElse(printed, () =>
      Option.liftPredicate(noKey, () => keyless(event, now.current.chords)),
    );
    for (const printedKey of Option.toArray(key)) {
      const next = step(printedKey, now.current, event);
      const was = now.current;
      now.current = next.state;
      if (next.state.chords !== was.chords) setChords(next.state.chords);
      if (!sameMove(next.state.move, was.move)) setMove(next.state.move);
      if (next.state.open !== was.open) setOpen(next.state.open);
      for (const cued of next.cues) cue(cued);
      if (!ThumbEvent.$is('Reset')(event) || isStill(was.move)) continue;
      setResets((count) => count + 1);
      setWaiting(next.state.open);
    }
  };
  const latest = useRef(apply);
  useLayoutEffect(() => {
    latest.current = apply;
  });
  /** A touch of the reader's: it ends any wait for a reset's close. */
  const keep = useCallback(() => setWaiting(false), []);
  const send = useCallback((event: ThumbEvent) => {
    setWaiting(false);
    latest.current(event);
  }, []);
  useEffect(() => {
    if (!waiting) return;
    const closing = Effect.runFork(
      Effect.sleep(Duration.millis(RESET_WAIT)).pipe(
        Effect.andThen(
          Effect.sync(() => {
            setWaiting(false);
            latest.current(ThumbEvent.ResetShown());
          }),
        ),
        Effect.provideService(Clock.Clock, clock),
      ),
    );
    return () => {
      Effect.runFork(Fiber.interrupt(closing));
    };
  }, [waiting, resets, clock]);
  const state = useMemo(() => ({ chords, move, open }), [chords, move, open]);
  return useMemo(
    () => ({ printed, state, send, keep, resets }),
    [printed, state, send, keep, resets],
  );
};

export type BoundThumb = ReturnType<typeof useThumb>;

/** The key a hymn with no chords steps from: a hold, a tap on the page and the switch's tap read none. */
const noKey: Chord.Key = { tonic: 'C', minor: false };

/**
 * The events a hymn with no chords takes: a hold, a tap on the page, and a
 * tap while chords are off, which turns them on (the key button is the
 * chords switch on every hymn's page). With chords on a tap opens nothing.
 */
const keyless = (event: ThumbEvent, chords: boolean) =>
  ThumbEvent.$is('Hold')(event) ||
  ThumbEvent.$is('TapPage')(event) ||
  (ThumbEvent.$is('Tap')(event) && !chords);

const sameMove = (a: Move, b: Move) => a.transpose === b.transpose && a.capo === b.capo;

/**
 * The dials `thumb` shows (`shownOf`), top to bottom, for a hymn printed in
 * `printed`, each a row of the panel they stand on (`DialPanel`). They draw
 * again only when the model does: a draw of the bar around them (a playback
 * tick) hands them the same model, so the 24 stops are not drawn again.
 */
export const Dials = memo(function Dials({
  thumb,
  printed,
  tuner,
}: {
  readonly thumb: BoundThumb;
  readonly printed: Chord.Key;
  readonly tuner: boolean;
}) {
  const { state, send, keep, resets } = thumb;
  const keys = useMemo(() => keyStops(printed), [printed]);
  const frets = useMemo(() => capoStops(printed, state.move), [printed, state.move]);
  const reset = () => send(ThumbEvent.Reset());
  const shown = shownOf(state, tuner);
  const chips = chipsOf(state, tuner);
  return (
    <View testID="dials" style={styles.dials} pointerEvents="box-none">
      {shown.map((row, k) => {
        const fromBottom = shown.length - 1 - k;
        if (row === 'chips')
          return (
            <PanelRow key="chips" fromBottom={fromBottom}>
              <View style={[styles.chips, tuner && styles.ends]}>
                {chips.map((chip) =>
                  Match.value(chip).pipe(
                    Match.when('tuner', () => (
                      <TunerChip key="tuner" onPress={() => send(ThumbEvent.Tune())} />
                    )),
                    Match.when('reset', () => (
                      <ResetChip key="reset" printed={printed} onPress={reset} />
                    )),
                    Match.exhaustive,
                  ),
                )}
              </View>
            </PanelRow>
          );
        if (row === 'capo')
          return (
            <PanelRow key="capo" fromBottom={fromBottom}>
              <DialView
                dial="capo"
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
                onTouch={keep}
                resets={resets}
              />
            </PanelRow>
          );
        return (
          <PanelRow key="key" fromBottom={fromBottom}>
            <DialView
              dial="key"
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
              onTouch={keep}
              resets={resets}
            />
          </PanelRow>
        );
      })}
    </View>
  );
});

/**
 * The Tuner, on the hymn page's dials on a device with the ear: a small
 * upright tuning fork (`TunerMark`) and its word. A tap closes the dials (`onPress`, the model's `Tune`) and
 * opens the tuner over the page at once, so the dials' close plays under it.
 * It plays no cue: the tuner's path is silent.
 */
function TunerChip({ onPress }: { readonly onPress: () => void }) {
  const router = useRouter();
  return (
    <Chip
      testID="dials-tuner"
      label="Tuner"
      hint="Opens the guitar tuner"
      mark={<TunerMark tint={color.onPill} />}
      onPress={() => {
        onPress();
        router.push('/tuner');
      }}
    >
      Tuner
    </Chip>
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
  return (
    <Chip
      testID="dials-reset"
      label="Reset"
      hint={`Back to ${keyName(printed)}, with no capo`}
      onPress={onPress}
    >
      {`↺ ${keyName(printed)}, no capo`}
    </Chip>
  );
}

/** A key on the key dial, the current one in the chord colour: the printed key marked with a dot under it. */
function KeyName({ stop, current }: { readonly stop: KeyStop; readonly current: boolean }) {
  return (
    <>
      <Text
        style={[styles.key, stop.name.length > 1 && styles.longKey, current && styles.current]}
        numberOfLines={1}
        maxFontSizeMultiplier={MOST_SCALE}
      >
        {stop.name}
      </Text>
      {stop.printed && <View style={styles.home} />}
    </>
  );
}

/** A fret on the capo dial: its number over the key played there, the current one and an open key in the chord colour. */
function Fret({ stop, current }: { readonly stop: CapoStop; readonly current: boolean }) {
  return (
    <>
      <Text
        style={[styles.fret, current && styles.current]}
        numberOfLines={1}
        maxFontSizeMultiplier={MOST_SCALE}
      >
        {stop.capo}
      </Text>
      <Text
        style={[styles.played, stop.open && styles.open]}
        numberOfLines={1}
        maxFontSizeMultiplier={MOST_SCALE}
      >
        {stop.played}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  dials: { gap: ROW_GAP, alignItems: 'stretch' },
  chips: { flexDirection: 'row', justifyContent: 'center' },
  ends: { justifyContent: 'space-between' },
  key: { fontSize: 17, fontWeight: '600', color: color.muted },
  longKey: { fontSize: 14 },
  current: { color: color.chord },
  home: {
    position: 'absolute',
    bottom: 5,
    width: 4,
    height: 4,
    borderRadius: 2,
    opacity: 0.7,
    backgroundColor: color.chord,
  },
  fret: { fontSize: 15, lineHeight: 17, fontWeight: '700', color: color.muted },
  played: { fontSize: 10, lineHeight: 12, color: color.muted },
  open: { fontWeight: '700', color: color.chord },
});
