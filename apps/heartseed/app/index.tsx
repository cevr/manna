import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'one';
import passage from 'virtual:heartseed-passage';

import { choose, gardenView, peek, press, sayItView } from '../src/app';
import {
  growthOf,
  stageOf,
  type GardenView,
  type Plant,
  type ReadGarden,
  type Stage,
} from '../src/garden';
import type { Mark } from '../src/matcher';
import { sourceWords } from '../src/matcher/words';
import { GRADE_NAMES, GRADES, type Grade, type SayItView } from '../src/sayit';
import { screenOf, wordOf, type Ink, type Result, type ShownWord } from '../src/sayit/screen';

/** Palette A (Wada No. 167) over the prototype's tokens. */
const color = {
  ground: '#eee8e1',
  card: '#f7f3ee',
  ink: '#064f6e',
  soft: '#a7d4e4',
  mute: '#7d8d95',
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

const WORDS = sourceWords(passage.text);

/** A word lights with a short fade; under Reduce Motion it shows at once. */
const LIGHT = FadeIn.duration(180).reduceMotion(ReduceMotion.System);

/** One source word drawn as `wordOf` shows it: a mark to peek at, or its text in its ink, an unseen one in a slot its width. */
function Word({
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
        style={({ pressed }) => [styles.mark, pressed && styles.pressed]}
      >
        <View style={styles.dot} />
      </Pressable>
    );
  const style = [styles.word, INK[shown.ink]];
  const label = Option.getOrUndefined(shown.label);
  switch (shown.ink) {
    case 'unseen':
      return (
        <View testID={id} aria-hidden={shown.hidden} aria-label={label} style={styles.slot}>
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

/** The verse whole, or one element per word while a recital is shown, each its own accessibility element. */
function Verse({
  marks,
  onPeek,
}: {
  readonly marks: Option.Option<readonly Mark[]>;
  readonly onPeek: (index: number) => void;
}) {
  return Option.match(marks, {
    onNone: () => (
      <Text testID="passage" style={styles.words}>
        {passage.text}
      </Text>
    ),
    onSome: (shown) => (
      <View style={styles.verse}>
        {shown.map((mark) => (
          <Word key={mark.index} shown={wordOf(mark, WORDS[mark.index] ?? '')} onPeek={onPeek} />
        ))}
      </View>
    ),
  });
}

/** The count, the suggestion and the four grades of a finished recital, the chosen one checked. */
function Grades({
  result,
  onChoose,
}: {
  readonly result: Result;
  readonly onChoose: (grade: Grade) => void;
}) {
  return (
    <View style={styles.result}>
      <Text testID="summary" style={styles.summary}>
        {result.summary}
      </Text>
      <Text style={styles.suggested}>{result.suggested}</Text>
      <View role="radiogroup" aria-label="Grade" style={styles.grades}>
        {GRADES.map((grade) => {
          const chosen = result.choice === grade;
          return (
            <Pressable
              key={grade}
              role="radio"
              aria-label={GRADE_NAMES[grade]}
              aria-checked={chosen}
              onPress={() => onChoose(grade)}
              style={({ pressed }) => [
                styles.grade,
                chosen && styles.chosen,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.gradeName, chosen && styles.chosenName]}>
                {GRADE_NAMES[grade]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** The one button: large, round and ink, with a gentle pulse while it listens (held still under Reduce Motion). */
function SayItButton({
  label,
  listening,
  pressable,
  onPress,
}: {
  readonly label: string;
  readonly listening: boolean;
  readonly pressable: boolean;
  readonly onPress: () => void;
}) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = 0;
    if (!listening) return;
    pulse.value = withRepeat(
      withTiming(1, {
        duration: 1200,
        easing: Easing.out(Easing.quad),
        reduceMotion: ReduceMotion.System,
      }),
      -1,
      false,
    );
  }, [listening, pulse]);
  const ring = useAnimatedStyle(() => ({
    opacity: 1 - pulse.value,
    transform: [{ scale: 1 + pulse.value * 0.4 }],
  }));
  return (
    <View style={styles.buttonPlace}>
      <Animated.View aria-hidden style={[styles.ring, ring]} />
      <Pressable
        role="button"
        aria-label={label}
        disabled={!pressable}
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.pressedButton,
          !pressable && styles.disabled,
        ]}
      >
        <Text style={styles.buttonText}>{label}</Text>
      </Pressable>
    </View>
  );
}

/** Each stage as the stage line shows it, and as the growth line names it. */
const STAGE_NAMES: Readonly<Record<Stage, { readonly shown: string; readonly grown: string }>> = {
  seed: { shown: 'A seed', grown: 'a seed' },
  blade: { shown: 'A blade', grown: 'a blade' },
  ear: { shown: 'An ear', grown: 'an ear' },
  'full corn': { shown: 'Full corn', grown: 'full corn' },
};

/** The garden once a read of it completed; none while the read runs, and none for the session when it failed. */
const readOf = (garden: Option.Option<GardenView>): Option.Option<ReadGarden> =>
  Option.filter(garden, (view): view is ReadGarden => view._tag === 'Read');

/** The passage's plant in the garden read, none before its first recital. */
const plantIn = (garden: ReadGarden) => Option.fromNullishOr(garden.plants.get(passage.reference));

/** The stage the finished recital Today shows grew the passage's plant to, none when it grew nothing or none is shown. */
const grownBy = (plant: Option.Option<Plant>, sayIt: Option.Option<SayItView>) =>
  Option.flatMap(plant, (each) =>
    Option.flatMap(sayIt, (view) =>
      Option.flatMap(
        Option.all({
          startedAt: Option.fromNullishOr(view.startedAt),
          choice: Option.fromNullishOr(view.choice),
        }),
        ({ startedAt }) => Option.map(growthOf(each, startedAt), (growth) => growth.to),
      ),
    ),
  );

/** The plant drawn small as the prototype draws it, hidden from the screen reader, which reads the stage line: a gold seed in the soil, a green stem and leaf, a green ear on the stem, a gold ear. */
function PlantMark({ stage }: { readonly stage: Stage }) {
  const grown = stage !== 'seed';
  const eared = stage === 'ear' || stage === 'full corn';
  const ripe = stage === 'full corn';
  return (
    <View testID="plant" aria-hidden style={styles.plant}>
      <View style={styles.soil} />
      {!grown && <View style={styles.seed} />}
      {grown && <View style={[styles.stem, eared && styles.tallStem]} />}
      {grown && <View style={styles.leaf} />}
      {eared && <View style={[styles.ear, ripe && styles.ripeEar]} />}
      {ripe && <View style={styles.awn} />}
    </View>
  );
}

/**
 * The passage's stage, its plant beside it once planted, and how the recital
 * shown grew it. Until a read of the garden completes, and for the session
 * when it failed, it claims nothing: the row holds its place empty, so a
 * planted verse never reads as not planted.
 */
function Growing({
  garden,
  sayIt,
}: {
  readonly garden: Option.Option<ReadGarden>;
  readonly sayIt: Option.Option<SayItView>;
}) {
  if (Option.isNone(garden))
    return (
      <View style={styles.growing}>
        <View style={styles.stageRow} />
      </View>
    );
  const plant = plantIn(garden.value);
  const stage = Option.map(plant, stageOf);
  const grown = grownBy(plant, sayIt);
  return (
    <View style={styles.growing}>
      <View style={styles.stageRow}>
        {Option.match(stage, {
          onNone: () => false,
          onSome: (each) => <PlantMark stage={each} />,
        })}
        <Text
          testID="stage"
          aria-label={`Stage: ${Option.getOrElse(stage, () => 'not planted')}`}
          style={styles.stage}
        >
          {Option.match(stage, {
            onNone: () => 'Not planted yet',
            onSome: (each) => STAGE_NAMES[each].shown,
          })}
        </Text>
      </View>
      {Option.match(grown, {
        onNone: () => false,
        onSome: (to) => (
          <Text testID="growth" style={styles.growth}>
            {`Grew to ${STAGE_NAMES[to].grown}.`}
          </Text>
        ),
      })}
    </View>
  );
}

/** Today: the passage the reader is learning, its stage, and Say it. */
export default function Today() {
  const insets = useSafeAreaInsets();
  const sayIt = AsyncResult.value(useAtomValue(sayItView));
  const garden = readOf(AsyncResult.value(useAtomValue(gardenView)));
  const screen = screenOf(sayIt);
  const onPress = useAtomSet(press);
  const onPeek = useAtomSet(peek);
  const onChoose = useAtomSet(choose);
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
      ]}
    >
      <Text role="heading" aria-level={1} style={styles.title}>
        Today
      </Text>
      <View style={styles.passage}>
        <Text testID="reference" style={styles.reference}>
          {passage.reference}
        </Text>
        <Verse marks={screen.marks} onPeek={onPeek} />
        <Growing garden={garden} sayIt={sayIt} />
      </View>
      {Option.match(screen.result, {
        onNone: () => false,
        onSome: (result) => <Grades result={result} onChoose={onChoose} />,
      })}
      {Option.match(screen.alert, {
        onNone: () => false,
        onSome: (alert) => (
          <Text role="alert" style={styles.alert}>
            {alert}
          </Text>
        ),
      })}
      <SayItButton
        label={screen.button}
        listening={screen.listening}
        pressable={screen.pressable}
        onPress={() => onPress()}
      />
    </ScrollView>
  );
}

const SERIF = 'Georgia';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  content: { paddingHorizontal: 24, gap: 28 },
  title: { fontSize: 34, fontWeight: '700', color: color.ink },
  passage: { gap: 10 },
  reference: { fontFamily: SERIF, fontSize: 17, fontWeight: '600', color: color.mute },
  words: { fontFamily: SERIF, fontSize: 24, lineHeight: 36, color: color.ink },
  verse: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 7, rowGap: 2 },
  word: { fontFamily: SERIF, fontSize: 24, lineHeight: 36 },
  lit: { color: color.ink },
  hearing: { color: color.mute, backgroundColor: color.hearing, borderRadius: 4 },
  slot: { height: 30, marginBottom: 6, borderBottomWidth: 2, borderBottomColor: color.soft },
  unsaid: { color: 'transparent', lineHeight: 30 },
  peeked: { color: color.miss },
  mark: { width: 28, height: 36, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.miss },
  result: { gap: 10, padding: 16, borderRadius: 20, backgroundColor: color.card },
  summary: { fontSize: 17, fontWeight: '600', color: color.ink },
  suggested: { fontSize: 15, color: color.mute },
  grades: { flexDirection: 'row', gap: 8, marginTop: 4 },
  grade: {
    flex: 1,
    minHeight: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.ground,
  },
  chosen: { backgroundColor: color.ink },
  gradeName: { fontSize: 15, fontWeight: '600', color: color.ink },
  chosenName: { color: color.ground },
  alert: { fontSize: 15, lineHeight: 21, color: color.miss },
  growing: { gap: 4, marginTop: 4 },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  stage: { fontSize: 15, color: color.mute },
  growth: { fontSize: 15, fontWeight: '600', color: color.ink },
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
const INK: Readonly<Record<Ink, (typeof styles)[keyof typeof styles]>> = {
  lit: styles.lit,
  hearing: styles.hearing,
  peeked: styles.peeked,
  unseen: styles.unsaid,
};
