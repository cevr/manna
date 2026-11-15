/**
 * What Today and the first minute draw alike, in the scheme now's roles
 * (`../look`): a recital's word as `wordOf` shows it, a word not yet said
 * under its cue (whole, in letters or nothing) and the one large round
 * button, with the styles every screen shares (`useLook`); the plant is
 * drawn with the home's hand-drawn set (`../home/plant`). Each word
 * is its own accessibility element; a word or part of one that is not shown
 * is laid out in transparent ink and hidden from the screen reader.
 */

import { Option } from 'effect';
import { constVoid } from 'effect/Function';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { themed, useThemed } from '../look';
import type { Cue, Mark } from '../matcher';
import { lettersOf, PEEK_SHOWN_MS } from './letters';
import { wordOf, type Ink, type ShownWord } from './screen';

/** A word lights with a short fade; under Reduce Motion it shows at once. */
const LIGHT = FadeIn.duration(180).reduceMotion(ReduceMotion.System);

/** One source word drawn as `wordOf` shows it: a mark to peek at, or its text in its ink, an unseen one in a slot its width. */
export function Word({
  shown,
  onPeek,
}: {
  readonly shown: ShownWord;
  readonly onPeek: (index: number) => void;
}) {
  const look = useLook();
  const id = `word-${shown.index}`;
  if (shown._tag === 'Mark')
    return (
      <Pressable
        testID={id}
        role="button"
        aria-label={shown.label}
        hitSlop={10}
        onPress={() => onPeek(shown.index)}
        style={({ pressed }) => [look.mark, pressed && look.pressed]}
      >
        <View style={look.dot} />
      </Pressable>
    );
  const style = [look.word, look[INK[shown.ink]]];
  const label = Option.getOrUndefined(shown.label);
  switch (shown.ink) {
    case 'unseen':
      return (
        <View testID={id} aria-hidden={shown.hidden} aria-label={label} style={look.slot}>
          <Text style={style}>{shown.text}</Text>
        </View>
      );
    case 'lit':
      return (
        <Animated.Text
          testID={id}
          entering={LIGHT}
          aria-hidden={shown.hidden}
          aria-label={label}
          style={style}
        >
          {shown.text}
        </Animated.Text>
      );
    case 'hearing':
    case 'peeked':
      return (
        <Text testID={id} aria-hidden={shown.hidden} aria-label={label} style={style}>
          {shown.text}
        </Text>
      );
  }
}

/** A word in letters before it is said: its first letter or number as written, in the cue's ink (AA on the ground), the rest laid out unseen, and only the letter named to the screen reader. */
export function Initial({ index, word }: { readonly index: number; readonly word: string }) {
  const look = useLook();
  const { before, cue, after } = lettersOf(word);
  return (
    <Text testID={`word-${index}`} aria-label={cue} style={look.word}>
      {before !== '' && (
        <Text aria-hidden style={look.unseenPart}>
          {before}
        </Text>
      )}
      <Text style={look.cueInk}>{cue}</Text>
      {after !== '' && (
        <Text aria-hidden style={look.unseenPart}>
          {after}
        </Text>
      )}
    </Text>
  );
}

/** What a word to peek at tells the screen reader it does. */
const PEEK_HINT = 'Shows the word for a moment. This try then counts as Hard at best.';

/** A word to peek at's name: the word while shown, else its letter under first letters and `Word <n>` under no cue. */
const peekName = (word: string, index: number, cue: 'initials' | 'none', shown: boolean) => {
  if (shown) return word;
  if (cue === 'initials') return lettersOf(word).cue;
  return `Word ${index + 1}`;
};

/**
 * A word not yet said on Today at rest, held in a button to peek at it
 * (`peek-<i>`): the word drawn as before inside it (its letters under first
 * letters, its empty slot under no cue), the button named by its letter or
 * `Word <n>`. A tap tells `onReveal` (the try's grade is capped) and shows
 * the word whole in the peeked ink for `PEEK_SHOWN_MS`, the button then
 * named by the word (so the screen reader reads it; Today announces nothing
 * aloud), then as before.
 */
function Peek({
  index,
  word,
  cue,
  onReveal,
}: {
  readonly index: number;
  readonly word: string;
  readonly cue: 'initials' | 'none';
  readonly onReveal: (index: number) => void;
}) {
  const look = useLook();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!shown) return;
    // oxlint-disable-next-line effect/noGlobals -- a React effect's own timer: the peeked word hides after its moment, and the timer is cleared when the word leaves.
    const hide = setTimeout(() => setShown(false), PEEK_SHOWN_MS);
    return () => clearTimeout(hide);
  }, [shown]);
  return (
    <Pressable
      testID={`peek-${index}`}
      role="button"
      aria-label={peekName(word, index, cue, shown)}
      accessibilityHint={PEEK_HINT}
      hitSlop={4}
      onPress={() => {
        onReveal(index);
        setShown(true);
      }}
      style={({ pressed }) => pressed && look.pressed}
    >
      {shown && <PeekedWord index={index} word={word} cue={cue} />}
      {!shown && cue === 'initials' && <Initial index={index} word={word} />}
      {!shown && cue === 'none' && <Word shown={wordOf(pendingAt(index), word)} onPeek={NO_PEEK} />}
    </Pressable>
  );
}

/** A mark's peek a word to peek at never takes: its slot is no mark. */
const NO_PEEK = constVoid;

/** A word peeked at rest, whole in the peeked ink, in its slot under no cue so nothing moves. */
function PeekedWord({
  index,
  word,
  cue,
}: {
  readonly index: number;
  readonly word: string;
  readonly cue: 'initials' | 'none';
}) {
  const look = useLook();
  if (cue === 'initials')
    return (
      <Text testID={`word-${index}`} style={[look.word, look.peeked]}>
        {word}
      </Text>
    );
  return (
    <View style={look.slot}>
      <Text testID={`word-${index}`} style={[look.word, look.unsaid, look.peeked]}>
        {word}
      </Text>
    </View>
  );
}

/**
 * A word Today has not yet heard, as the cue its recital is said under
 * shows it: whole in the cue's ink under the full text, in letters in the
 * same ink under first letters (`Initial`), and under no cue an empty slot
 * hidden from the screen reader, as `wordOf` shows a pending word. Given
 * `onReveal` (Today at rest, before a try), a word in letters or a slot is
 * a button to peek at it (`Peek`).
 */
export function Unsaid({
  index,
  word,
  cue,
  onPeek,
  onReveal = Option.none(),
}: {
  readonly index: number;
  readonly word: string;
  readonly cue: Cue;
  readonly onPeek: (index: number) => void;
  readonly onReveal?: Option.Option<(index: number) => void>;
}) {
  const look = useLook();
  if (Option.isSome(onReveal) && cue !== 'full')
    return <Peek index={index} word={word} cue={cue} onReveal={onReveal.value} />;
  switch (cue) {
    case 'full':
      return (
        <Text testID={`word-${index}`} style={[look.word, look.cueInk]}>
          {word}
        </Text>
      );
    case 'initials':
      return <Initial index={index} word={word} />;
    case 'none':
      return <Word shown={wordOf(pendingAt(index), word)} onPeek={onPeek} />;
  }
}

/** The mark of a word no recital has reached. */
export const pendingAt = (index: number): Mark => ({
  index,
  status: 'pending',
  time: Option.getOrNull(Option.none()),
  revealed: Option.getOrNull(Option.none()),
});

/** The one button: large, round and ink, with a gentle pulse while it works (held still under Reduce Motion). */
export function BigButton({
  label,
  busy,
  pressable,
  onPress,
}: {
  readonly label: string;
  readonly busy: boolean;
  readonly pressable: boolean;
  readonly onPress: () => void;
}) {
  const look = useLook();
  return (
    <View style={look.buttonPlace}>
      <Pulse busy={busy} />
      <Pressable
        role="button"
        aria-label={label}
        disabled={!pressable}
        onPress={onPress}
        style={({ pressed }) => [
          look.button,
          pressed && look.pressedButton,
          !pressable && look.disabled,
        ]}
      >
        <Text style={look.buttonText}>{label}</Text>
      </Pressable>
    </View>
  );
}

/** The ring behind the big button, which pulses while `busy` (held still under Reduce Motion); it holds the button's place when no button shows. */
export function Pulse({ busy }: { readonly busy: boolean }) {
  const look = useLook();
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = 0;
    if (!busy) return;
    pulse.value = withRepeat(
      withTiming(1, {
        duration: 1200,
        easing: Easing.out(Easing.quad),
        reduceMotion: ReduceMotion.System,
      }),
      -1,
      false,
    );
  }, [busy, pulse]);
  const ring = useAnimatedStyle(() => ({
    opacity: 1 - pulse.value,
    transform: [{ scale: 1 + pulse.value * 0.4 }],
  }));
  return <Animated.View aria-hidden style={[look.ring, ring]} />;
}

/** The space between two rows of one line of a verse, in points. */
const ROW_GAP = 2;

/** The space between two lines of a lined verse, in points: a break row and the row gap on either side of it. */
const LINE_GAP = 10;

/** The styles every screen shares, in each scheme. */
const looks = themed((color, face) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: color.ground },
    content: { paddingHorizontal: 24, gap: 28 },
    title: { fontFamily: face, fontSize: 34, fontWeight: '700', color: color.ink },
    reference: { fontFamily: face, fontSize: 17, fontWeight: '600', color: color.quiet },
    verse: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 7, rowGap: ROW_GAP },
    lineBreak: { width: '100%', height: LINE_GAP - 2 * ROW_GAP },
    word: { fontFamily: face, fontSize: 24, lineHeight: 36 },
    lit: { color: color.ink },
    hearing: { color: color.quiet, backgroundColor: color.hearing, borderRadius: 4 },
    slot: { height: 30, marginBottom: 6, borderBottomWidth: 2, borderBottomColor: color.soft },
    unsaid: { color: 'transparent', lineHeight: 30 },
    peeked: { color: color.miss },
    cueInk: { color: color.quiet },
    unseenPart: { color: 'transparent' },
    mark: { width: 28, height: 36, alignItems: 'center', justifyContent: 'center' },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.miss },
    summary: { fontFamily: face, fontSize: 17, fontWeight: '600', color: color.ink },
    alert: { fontFamily: face, fontSize: 15, lineHeight: 21, color: color.miss },
    stageRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
    stage: { fontFamily: face, fontSize: 15, color: color.quiet },
    buttonPlace: { alignSelf: 'center', width: 132, height: 132, marginTop: 8 },
    ring: {
      position: 'absolute',
      width: 132,
      height: 132,
      borderRadius: 66,
      backgroundColor: color.pulse,
    },
    button: {
      width: 132,
      height: 132,
      borderRadius: 66,
      backgroundColor: color.ink,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: color.shadow,
      shadowOpacity: 0.3,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
    },
    pressedButton: { transform: [{ scale: 0.97 }] },
    pressed: { opacity: 0.8 },
    disabled: { opacity: 0.6 },
    buttonText: { fontFamily: face, color: color.onInk, fontSize: 17, fontWeight: '600' },
  }),
);

/** The styles every screen shares, in the scheme now. */
export const useLook = () => useThemed(looks);

/** Each ink's style: an unseen word is laid out transparent, so only its slot's underline shows. */
const INK = {
  lit: 'lit',
  hearing: 'hearing',
  peeked: 'peeked',
  unseen: 'unsaid',
} as const satisfies Readonly<Record<Ink, string>>;
