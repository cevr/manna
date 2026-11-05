/**
 * What Today and the first minute draw alike: Palette A, a recital's word as
 * `wordOf` shows it, a word not yet said under its cue (whole, in letters or
 * nothing), the one large round button, and the plant. Each word is
 * its own accessibility element; a word or part of one that is not shown is
 * laid out in transparent ink and hidden from the screen reader.
 */

import { Option } from 'effect';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import type { PlantStage } from '../field';
import type { Cue, Mark } from '../matcher';
import { wordOf, type Ink, type ShownWord } from './screen';

/** Palette A (Wada No. 167) over the prototype's tokens; `cue` is the mute darkened so a word Today shows as its cue reads at AA contrast (4.5:1) on the ground. */
export const color = {
  ground: '#eee8e1',
  card: '#f7f3ee',
  ink: '#064f6e',
  soft: '#a7d4e4',
  mute: '#7d8d95',
  cue: '#56656d',
  miss: '#c0583f',
  hearing: 'rgba(184, 137, 47, 0.22)',
  pulse: 'rgba(184, 137, 47, 0.45)',
} as const;

/** The plant's colours as the prototype draws it: gold, the leaf's green, the unripe ear's green and the soil. */
const field = {
  gold: '#d4a640',
  leaf: '#6f9a4a',
  greenEar: '#9cbf6a',
  soil: '#8a6e4b',
} as const;

const SERIF = 'Georgia';

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
  const style = [look.word, INK[shown.ink]];
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

const LETTER = /[\p{L}\p{N}]/u;

/** A word in letters before it is said: its first letter or number as written, in the first minute's muted ink unless `ink` is given, the rest laid out unseen, and only the letter named to the screen reader. */
export function Initial({
  index,
  word,
  ink = look.cue,
}: {
  readonly index: number;
  readonly word: string;
  readonly ink?: TextStyle;
}) {
  const at = Math.max(0, word.search(LETTER));
  const cue = word.slice(at, at + 1);
  const before = word.slice(0, at);
  const after = word.slice(at + 1);
  return (
    <Text testID={`word-${index}`} aria-label={cue} style={look.word}>
      {before !== '' && (
        <Text aria-hidden style={look.unseenPart}>
          {before}
        </Text>
      )}
      <Text style={ink}>{cue}</Text>
      {after !== '' && (
        <Text aria-hidden style={look.unseenPart}>
          {after}
        </Text>
      )}
    </Text>
  );
}

/**
 * A word Today has not yet heard, as the cue its recital is said under
 * shows it: whole in the cue's ink under the full text, in letters in the
 * same ink under first letters (`Initial`), and under no cue an empty slot
 * hidden from the screen reader, as `wordOf` shows a pending word.
 */
export function Unsaid({
  index,
  word,
  cue,
  onPeek,
}: {
  readonly index: number;
  readonly word: string;
  readonly cue: Cue;
  readonly onPeek: (index: number) => void;
}) {
  switch (cue) {
    case 'full':
      return (
        <Text testID={`word-${index}`} style={[look.word, look.cueInk]}>
          {word}
        </Text>
      );
    case 'initials':
      return <Initial index={index} word={word} ink={look.cueInk} />;
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

/** The plant drawn as the prototype draws it, hidden from the screen reader, which reads the stage line or the field's label: bare soil before planting, a gold seed in the soil, a green stem and leaf, a green ear on the stem, a gold ear. */
export function PlantMark({ stage }: { readonly stage: PlantStage }) {
  const sown = stage !== 'not planted';
  const grown = sown && stage !== 'seed';
  const eared = stage === 'ear' || stage === 'full corn';
  const ripe = stage === 'full corn';
  return (
    <View testID="plant" aria-hidden style={look.plant}>
      <View style={look.soil} />
      {sown && !grown && <View style={look.seed} />}
      {grown && <View style={[look.stem, eared && look.tallStem]} />}
      {grown && <View style={look.leaf} />}
      {eared && <View style={[look.ear, ripe && look.ripeEar]} />}
      {ripe && <View style={look.awn} />}
    </View>
  );
}

/** The styles both screens share. */
export const look = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  content: { paddingHorizontal: 24, gap: 28 },
  title: { fontSize: 34, fontWeight: '700', color: color.ink },
  reference: { fontFamily: SERIF, fontSize: 17, fontWeight: '600', color: color.mute },
  verse: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 7, rowGap: 2 },
  word: { fontFamily: SERIF, fontSize: 24, lineHeight: 36 },
  lit: { color: color.ink },
  hearing: { color: color.mute, backgroundColor: color.hearing, borderRadius: 4 },
  slot: { height: 30, marginBottom: 6, borderBottomWidth: 2, borderBottomColor: color.soft },
  unsaid: { color: 'transparent', lineHeight: 30 },
  peeked: { color: color.miss },
  cue: { color: color.mute },
  cueInk: { color: color.cue },
  unseenPart: { color: 'transparent' },
  mark: { width: 28, height: 36, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.miss },
  summary: { fontSize: 17, fontWeight: '600', color: color.ink },
  alert: { fontSize: 15, lineHeight: 21, color: color.miss },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  stage: { fontSize: 15, color: color.mute },
  plant: { width: 24, height: 28 },
  soil: {
    position: 'absolute',
    left: 2,
    right: 2,
    bottom: 1,
    height: 2.5,
    borderRadius: 1.25,
    backgroundColor: field.soil,
  },
  seed: {
    position: 'absolute',
    left: 8,
    bottom: 4,
    width: 8,
    height: 6,
    borderRadius: 4,
    backgroundColor: field.gold,
  },
  stem: {
    position: 'absolute',
    left: 11,
    bottom: 3,
    width: 2.5,
    height: 14,
    borderRadius: 1.25,
    backgroundColor: field.leaf,
  },
  tallStem: { height: 19 },
  leaf: {
    position: 'absolute',
    left: 3,
    bottom: 8,
    width: 9,
    height: 4,
    borderRadius: 2,
    backgroundColor: field.leaf,
    transform: [{ rotate: '-35deg' }],
  },
  ear: {
    position: 'absolute',
    left: 8,
    top: 1,
    width: 8,
    height: 10,
    borderRadius: 4,
    backgroundColor: field.greenEar,
  },
  ripeEar: { backgroundColor: field.gold },
  awn: {
    position: 'absolute',
    left: 11.25,
    top: -3,
    width: 1.5,
    height: 4,
    backgroundColor: field.gold,
  },
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
    shadowColor: color.ink,
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  pressedButton: { transform: [{ scale: 0.97 }] },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.6 },
  buttonText: { color: color.ground, fontSize: 17, fontWeight: '600' },
});

/** Each ink's style: an unseen word is laid out transparent, so only its slot's underline shows. */
const INK: Readonly<Record<Ink, (typeof look)[keyof typeof look]>> = {
  lit: look.lit,
  hearing: look.hearing,
  peeked: look.peeked,
  unseen: look.unsaid,
};
