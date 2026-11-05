import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'one';
import passage from 'virtual:heartseed-passage';

import { choose, gardenView, peek, press, sayItView } from '../src/app';
import { openingOf, shownOpening, type Opening } from '../src/first/flow';
import { FirstMinute } from '../src/first/screen';
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
import { BigButton, color, look, PlantMark, Word } from '../src/sayit/draw';
import { screenOf, wordOf, type Result } from '../src/sayit/screen';

const WORDS = sourceWords(passage.text);

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
      <View style={look.verse}>
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
      <Text testID="summary" style={look.summary}>
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
                pressed && look.pressed,
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
        <View style={look.stageRow} />
      </View>
    );
  const plant = plantIn(garden.value);
  const stage = Option.map(plant, stageOf);
  const grown = grownBy(plant, sayIt);
  return (
    <View style={styles.growing}>
      <View style={look.stageRow}>
        {Option.match(stage, {
          onNone: () => false,
          onSome: (each) => <PlantMark stage={each} />,
        })}
        <Text
          testID="stage"
          aria-label={`Stage: ${Option.getOrElse(stage, () => 'not planted')}`}
          style={look.stage}
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
function Today() {
  const insets = useSafeAreaInsets();
  const sayIt = AsyncResult.value(useAtomValue(sayItView));
  const garden = readOf(AsyncResult.value(useAtomValue(gardenView)));
  const screen = screenOf(sayIt);
  const onPress = useAtomSet(press);
  const onPeek = useAtomSet(peek);
  const onChoose = useAtomSet(choose);
  return (
    <ScrollView
      style={look.screen}
      contentContainerStyle={[
        look.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
      ]}
    >
      <Text role="heading" aria-level={1} style={look.title}>
        Today
      </Text>
      <View style={styles.passage}>
        <Text testID="reference" style={look.reference}>
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
          <Text role="alert" style={look.alert}>
            {alert}
          </Text>
        ),
      })}
      <BigButton
        label={screen.button}
        busy={screen.listening}
        pressable={screen.pressable}
        onPress={() => onPress()}
      />
    </ScrollView>
  );
}

/** The frame a launch shows until the garden's read decides the screen: the reference alone, with no heading, button or claim. */
function Pending() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[look.screen, look.content, { paddingTop: insets.top + 16 }]}>
      <Text testID="reference" style={look.reference}>
        {passage.reference}
      </Text>
    </View>
  );
}

/**
 * The root: the pending frame until the garden's read completes, then the
 * first minute when the read holds no recall of any verse, else Today. The
 * screen is decided once per launch, at the read: planting the seed inside
 * the first minute keeps Planted on until Continue.
 */
export default function Root() {
  const read = openingOf(AsyncResult.value(useAtomValue(gardenView)));
  const [decided, setDecided] = useState<Opening>('pending');
  if (decided === 'pending' && read !== 'pending') setDecided(read);
  switch (shownOpening(decided, read)) {
    case 'pending':
      return <Pending />;
    case 'first':
      return <FirstMinute onContinue={() => setDecided('today')} />;
    case 'today':
      return <Today />;
  }
}

const styles = StyleSheet.create({
  passage: { gap: 10 },
  words: { fontFamily: 'Georgia', fontSize: 24, lineHeight: 36, color: color.ink },
  result: { gap: 10, padding: 16, borderRadius: 20, backgroundColor: color.card },
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
  growing: { gap: 4, marginTop: 4 },
  growth: { fontSize: 15, fontWeight: '600', color: color.ink },
});
