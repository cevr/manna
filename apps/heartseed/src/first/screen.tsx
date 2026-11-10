/**
 * The first minute: the passage in three phases, then the seed. Hear it
 * (the voice reads it at Listen and lights each word it speaks in the
 * reading view, whose hold seeks the reading as Today's does, the screen's
 * scroll still while held; Next goes on at any time), say it with its first letters (a cued recital that keeps
 * nothing), say it alone (the recital that plants it), then Planted, once
 * the garden's read holds the passage's recall. The phase is the screen's,
 * kept by the reducer `./flow`; nothing of it is stored.
 *
 * No word is shown before its phase shows it: hear shows the verse whole,
 * letters each word's first letter, alone nothing, and in letters and alone
 * only a recital of the phase's own shows the words it heard. A word or a
 * part of one that is not shown is laid out in transparent ink and hidden
 * from the screen reader.
 */

import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { Match, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'one';
import passage from 'virtual:heartseed-passage';

import {
  gardenView,
  holdReading,
  hush,
  letGo,
  listen,
  peek,
  sayAs,
  sayItView,
  seekTo,
  voiceView,
} from '../app';
import type { GardenView } from '../garden';
import type { Mark } from '../matcher';
import { sourceWords } from '../matcher/words';
import { PlantImage } from '../home/plant';
import { ReadingView, type Hold } from '../reading/view';
import type { OrNull, Recital, SayItView } from '../sayit';
import { themed, useThemed } from '../look';
import { BigButton, Initial, Pulse, useLook, Word } from '../sayit/draw';
import { screenOf, wordOf } from '../sayit/screen';
import type { VoiceView } from '../voice';
import { isActive } from '../voice/reading';
import { begin, isOwn, observe, step, type Flow, type Phase } from './flow';

const WORDS = sourceWords(passage.text);

/** Each phase's heading and the line under it. */
const COPY: Readonly<Record<Phase, { readonly heading: string; readonly line: string }>> = {
  hear: { heading: 'Hear it', line: 'The voice reads it. Words light as they are read.' },
  letters: { heading: 'Say it with help', line: 'First letters stay. Tap the button and say it.' },
  alone: { heading: 'Say it alone', line: 'Only the line is left. Say it from memory.' },
  planted: { heading: 'Planted', line: 'Your first promise is a seed.' },
};

const PHASES: readonly Phase[] = ['hear', 'letters', 'alone', 'planted'];

const ABSENT: OrNull<never> = Option.getOrNull(Option.none());

/** A word no recital of the phase's own has reached. */
const pending = (index: number): Mark => ({
  index,
  status: 'pending',
  time: ABSENT,
  revealed: ABSENT,
});

/** The four segments of the phase bar, those reached in ink; hidden from the screen reader, which reads the heading. */
function PhaseBar({ phase }: { readonly phase: Phase }) {
  const styles = useThemed(sheets);
  const at = PHASES.indexOf(phase);
  return (
    <View aria-hidden style={styles.phases}>
      {PHASES.map((each, index) => (
        <View key={each} style={[styles.segment, index <= at && styles.reached]} />
      ))}
    </View>
  );
}

/** A small round-cornered button, for Next and Continue. */
function Pill({ label, onPress }: { readonly label: string; readonly onPress: () => void }) {
  const look = useLook();
  const styles = useThemed(sheets);
  return (
    <Pressable
      role="button"
      aria-label={label}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, pressed && look.pressed]}
    >
      <Text style={styles.pillText}>{label}</Text>
    </Pressable>
  );
}

/** The verse as hear shows it: every word whole; while the voice reads the passage, the reading view under the first minute's hold (the words spoken in ink, the rest muted, the voice's current words or the held word selected). */
function Heard({ voice, hold }: { readonly voice: Option.Option<VoiceView>; readonly hold: Hold }) {
  const look = useLook();
  const styles = useThemed(sheets);
  const reading = Option.filter(voice, isActive);
  const own = Option.filter(reading, (view) => view.verse === passage.text);
  if (Option.isSome(own)) return <ReadingView text={passage.text} view={own.value} hold={hold} />;
  return (
    <View style={look.verse}>
      {WORDS.map((word, index) => {
        const lit = Option.match(reading, {
          onNone: () => true,
          onSome: (view) => index < view.lit,
        });
        const selected = Option.exists(reading, (view) =>
          Option.exists(
            Option.fromNullishOr(view.current),
            (range) => index >= range.first && index <= range.last,
          ),
        );
        return (
          <Text
            key={index}
            testID={`word-${index}`}
            aria-selected={selected}
            style={[look.word, look.lit, !lit && styles.unread, selected && styles.current]}
          >
            {word}
          </Text>
        );
      })}
    </View>
  );
}

/** The verse as letters and alone show it: a recital of the phase's own by `wordOf`, else each word's cue in letters and nothing in alone. */
function Recited({
  phase,
  marks,
  onPeek,
}: {
  readonly phase: 'letters' | 'alone';
  readonly marks: Option.Option<readonly Mark[]>;
  readonly onPeek: (index: number) => void;
}) {
  const look = useLook();
  return (
    <View style={look.verse}>
      {WORDS.map((word, index) => {
        const mark = Option.getOrElse(
          Option.flatMap(marks, (all) => Option.fromNullishOr(all[index])),
          () => pending(index),
        );
        if (phase === 'letters' && mark.status === 'pending')
          return <Initial key={index} index={index} word={word} />;
        return <Word key={index} shown={wordOf(mark, word)} onPeek={onPeek} />;
      })}
    </View>
  );
}

/** What the flow sees of the services now. */
const seenOf = (
  voice: Option.Option<VoiceView>,
  sayIt: Option.Option<SayItView>,
  garden: Option.Option<GardenView>,
) => ({
  voiceEnded: Option.getOrNull(Option.flatMap(voice, (view) => Option.fromNullishOr(view.ended))),
  startedAt: Option.getOrNull(
    Option.flatMap(sayIt, (view) => Option.fromNullishOr(view.startedAt)),
  ),
  finished: Option.exists(
    sayIt,
    (view) => view.dictation.status === 'idle' && view.dictation.ended === 'finished',
  ),
  planted: Option.exists(
    garden,
    (view) => view._tag === 'Read' && view.plants.has(passage.reference),
  ),
});

/** The first minute; `onContinue` leaves it for Today. */
export function FirstMinute({ onContinue }: { readonly onContinue: () => void }) {
  const look = useLook();
  const styles = useThemed(sheets);
  const insets = useSafeAreaInsets();
  const voice = AsyncResult.value(useAtomValue(voiceView));
  const sayIt = AsyncResult.value(useAtomValue(sayItView));
  const garden = AsyncResult.value(useAtomValue(gardenView));
  const onListen = useAtomSet(listen);
  const onHush = useAtomSet(hush);
  const onSay = useAtomSet(sayAs);
  const onPeek = useAtomSet(peek);
  const seen = seenOf(voice, sayIt, garden);
  const [held, setHeld] = useState<Flow>(() => begin(seen.startedAt));
  const flow = observe(held, seen);
  if (flow !== held) setHeld(flow);
  const { phase } = flow;
  const reading = Option.exists(voice, isActive);
  const voiceOn = Option.exists(voice, (view) => view.enabled);
  /** Set at Next: the skip stops the voice whatever the last frame drew of it, and a Listen tapped after it, before the frame that leaves hear, reads nothing. */
  const skipped = useRef(false);
  const onNext = () => {
    skipped.current = true;
    onHush();
    setHeld((now) => step(now, { _tag: 'Next' }));
  };
  const onRead = () => {
    if (!skipped.current) onListen();
  };
  const [heldWord, setHeldWord] = useState<Option.Option<number>>(Option.none());
  const heldNow = Option.filter(heldWord, () => reading && phase === 'hear');
  const onHold = useAtomSet(holdReading);
  const onSeekTo = useAtomSet(seekTo);
  const onLetGo = useAtomSet(letGo);
  const hold: Hold = {
    held: heldNow,
    onHeld: setHeldWord,
    onHold: () => {
      if (!skipped.current) onHold();
    },
    onSeek: (word) => {
      if (!skipped.current) onSeekTo(word);
    },
    onLetGo: () => {
      if (!skipped.current) onLetGo();
    },
  };
  return (
    <ScrollView
      scrollEnabled={Option.isNone(heldNow)}
      style={look.screen}
      contentContainerStyle={[
        look.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
      ]}
    >
      <PhaseBar phase={phase} />
      <View style={styles.head}>
        <Text role="heading" aria-level={1} style={look.title}>
          {COPY[phase].heading}
        </Text>
        <Text testID="reference" style={look.reference}>
          {passage.reference}
        </Text>
      </View>
      {Match.value(phase).pipe(
        Match.when('hear', () => (
          <Hear
            voice={voice}
            hold={hold}
            reading={reading}
            voiceOn={voiceOn}
            onListen={onRead}
            onNext={onNext}
          />
        )),
        Match.when('planted', () => <Planted onContinue={onContinue} />),
        Match.orElse((said) => (
          <Say
            phase={said}
            sayIt={sayIt}
            own={isOwn(flow, seen.startedAt)}
            onSay={() => onSay(HOW[said])}
            onPeek={(index) => onPeek(index)}
          />
        )),
      )}
    </ScrollView>
  );
}

/** How each phase that says the verse recites it: letters under the first-letter cue, kept by nothing; alone with no cue, kept. */
const HOW: Readonly<Record<'letters' | 'alone', Recital>> = {
  letters: { cue: 'initials', keep: false },
  alone: { cue: 'none', keep: true },
};

/** Hear: the verse whole (lit and held while read), Listen while the voice is on and idle (a pulse while it reads), and Next. */
function Hear({
  voice,
  hold,
  reading,
  voiceOn,
  onListen,
  onNext,
}: {
  readonly voice: Option.Option<VoiceView>;
  readonly hold: Hold;
  readonly reading: boolean;
  readonly voiceOn: boolean;
  readonly onListen: () => void;
  readonly onNext: () => void;
}) {
  const look = useLook();
  const styles = useThemed(sheets);
  return (
    <>
      <Heard voice={voice} hold={hold} />
      <View style={styles.hearActions}>
        {voiceOn && !reading && (
          <BigButton label="Listen" busy={false} pressable onPress={onListen} />
        )}
        {voiceOn && reading && (
          <View style={look.buttonPlace}>
            <Pulse busy />
          </View>
        )}
        <Pill label="Next" onPress={onNext} />
      </View>
      <Text style={styles.line}>{COPY.hear.line}</Text>
    </>
  );
}

/** Letters and alone: the verse as the phase shows it, the count or the alert of a recital of the phase's own, and Say it. */
function Say({
  phase,
  sayIt,
  own,
  onSay,
  onPeek,
}: {
  readonly phase: 'letters' | 'alone';
  readonly sayIt: Option.Option<SayItView>;
  readonly own: boolean;
  readonly onSay: () => void;
  readonly onPeek: (index: number) => void;
}) {
  const look = useLook();
  const styles = useThemed(sheets);
  const screen = screenOf(sayIt);
  const mine = <A,>(shown: Option.Option<A>) => Option.filter(shown, () => own);
  return (
    <>
      <Recited phase={phase} marks={mine(screen.marks)} onPeek={onPeek} />
      {Option.match(mine(screen.result), {
        onNone: () => false,
        onSome: (result) => (
          <Text testID="summary" style={look.summary}>
            {result.summary}
          </Text>
        ),
      })}
      {Option.match(mine(screen.alert), {
        onNone: () => false,
        onSome: (alert) => (
          <Text role="alert" style={look.alert}>
            {alert}
          </Text>
        ),
      })}
      <BigButton
        label={screen.button}
        busy={screen.listening}
        pressable={screen.pressable}
        onPress={onSay}
      />
      <Text style={styles.line}>{COPY[phase].line}</Text>
    </>
  );
}

/** Planted: the hand-drawn seed at 112 pt in its 120 pt place, still, its stage line, and Continue. */
function Planted({ onContinue }: { readonly onContinue: () => void }) {
  const look = useLook();
  const styles = useThemed(sheets);
  return (
    <View style={styles.planted}>
      <View style={styles.bigPlant}>
        <PlantImage stage="seed" size={112} />
      </View>
      <View style={look.stageRow}>
        <Text testID="stage" aria-label="Stage: seed" style={look.stage}>
          A seed
        </Text>
      </View>
      <Text style={styles.line}>{COPY.planted.line}</Text>
      <Pill label="Continue" onPress={onContinue} />
    </View>
  );
}

const sheets = themed((color, face) =>
  StyleSheet.create({
    head: { gap: 6 },
    phases: { flexDirection: 'row', gap: 6 },
    segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: color.soft, opacity: 0.5 },
    reached: { backgroundColor: color.ink, opacity: 1 },
    unread: { color: color.quiet },
    current: { backgroundColor: color.hearing, borderRadius: 4 },
    line: { fontFamily: face, fontSize: 13, color: color.quiet, textAlign: 'center' },
    hearActions: { alignItems: 'center', gap: 16 },
    pill: {
      minHeight: 44,
      paddingHorizontal: 22,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      backgroundColor: color.card,
    },
    pillText: { fontFamily: face, fontSize: 17, fontWeight: '600', color: color.ink },
    planted: { alignItems: 'center', gap: 16, paddingTop: 24 },
    bigPlant: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },
  }),
);
