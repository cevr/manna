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

export const ChordReaderContext = createContext<ChordReader>(reader);

export const RESET_WAIT = 600;

export const ResetClock = createContext<Clock.Clock>(Clock.Clock.defaultValue());

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

const noKey: Chord.Key = { tonic: 'C', minor: false };

const keyless = (event: ThumbEvent, chords: boolean) =>
  ThumbEvent.$is('Hold')(event) ||
  ThumbEvent.$is('TapPage')(event) ||
  (ThumbEvent.$is('Tap')(event) && !chords);

const sameMove = (a: Move, b: Move) => a.transpose === b.transpose && a.capo === b.capo;

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
