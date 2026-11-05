import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'one';
import passage from 'virtual:heartseed-passage';

import { choose, gardenView, peek, press, sayItView } from '../src/app';
import { fieldOf, type FieldPassage } from '../src/field';
import { FieldScreen } from '../src/field/screen';
import { openingOf, shownOpening, type Opening } from '../src/first/flow';
import { FirstMinute } from '../src/first/screen';
import {
  cueIn,
  growthOf,
  stageOf,
  type GardenView,
  type Plant,
  type ReadGarden,
  type Stage,
} from '../src/garden';
import type { Cue, Mark } from '../src/matcher';
import { sourceWords } from '../src/matcher/words';
import { GRADE_NAMES, GRADES, type Grade, type SayItView } from '../src/sayit';
import { BigButton, color, look, PlantMark, Unsaid, Word } from '../src/sayit/draw';
import { screenOf, wordOf, type Result } from '../src/sayit/screen';

const WORDS = sourceWords(passage.text);

/** The passages the field shows first: Today's, a passage of one verse. */
const PASSAGES: readonly FieldPassage[] = [
  { title: passage.reference, verses: [passage.reference] },
];

/**
 * The verse under `cue`: whole under the full text while no recital is
 * shown; else one element per word, each its own accessibility element, a
 * word the recital shown has reached as `wordOf` shows it and every other
 * word as the cue shows it (`Unsaid`): whole or in letters in the cue's ink,
 * or an empty slot.
 */
function Verse({
  marks,
  cue,
  onPeek,
}: {
  readonly marks: Option.Option<readonly Mark[]>;
  readonly cue: Cue;
  readonly onPeek: (index: number) => void;
}) {
  if (Option.isNone(marks) && cue === 'full')
    return (
      <Text testID="passage" style={styles.words}>
        {passage.text}
      </Text>
    );
  return (
    <View style={look.verse}>
      {WORDS.map((word, index) => {
        const mark = Option.flatMap(marks, (all) => Option.fromNullishOr(all[index]));
        if (Option.isNone(mark) || mark.value.status === 'pending')
          return <Unsaid key={index} index={index} word={word} cue={cue} onPeek={onPeek} />;
        return <Word key={index} shown={wordOf(mark.value, word)} onPeek={onPeek} />;
      })}
    </View>
  );
}

/**
 * The cue Today shows the passage under: a recital's own while one is shown
 * (its marks), else the one the garden's ladder gives it now, and the full
 * text in an unread garden, which shows the verse whole and claims no stage.
 */
const shownCue = (
  garden: Option.Option<ReadGarden>,
  sayIt: Option.Option<SayItView>,
  marks: Option.Option<readonly Mark[]>,
): Cue => {
  if (Option.isSome(marks) && Option.isSome(sayIt)) return sayIt.value.cue;
  return Option.match(garden, {
    onNone: (): Cue => 'full',
    onSome: (read) => cueIn(read, passage.reference),
  });
};

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

/** The way to the field: offered once the garden is read, and never while Say it listens, so leaving Today never leaves a recital listening. */
function FieldControl({ onPress }: { readonly onPress: () => void }) {
  return (
    <Pressable
      role="button"
      aria-label="Your field"
      onPress={onPress}
      style={({ pressed }) => [styles.toField, pressed && look.pressed]}
    >
      <Text style={styles.toFieldText}>Your field</Text>
    </Pressable>
  );
}

/**
 * Today: its header (the heading and the way to the field), fixed above a
 * scroll view of the passage the reader is learning, its stage and Say it.
 * The way to the field sits outside the scroll view, so however much a
 * recital adds below, it is on screen without a scroll and clear of the
 * home indicator.
 */
function Today({ onField }: { readonly onField: () => void }) {
  const insets = useSafeAreaInsets();
  const sayIt = AsyncResult.value(useAtomValue(sayItView));
  const garden = readOf(AsyncResult.value(useAtomValue(gardenView)));
  const screen = screenOf(sayIt);
  const onPress = useAtomSet(press);
  const onPeek = useAtomSet(peek);
  const onChoose = useAtomSet(choose);
  return (
    <View style={look.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerRow}>
          <Text role="heading" aria-level={1} style={look.title}>
            Today
          </Text>
          {Option.isSome(garden) && !screen.listening && <FieldControl onPress={onField} />}
        </View>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          look.content,
          { paddingTop: 16, paddingBottom: insets.bottom + 32 },
        ]}
      >
        <View style={styles.passage}>
          <Text testID="reference" style={look.reference}>
            {passage.reference}
          </Text>
          <Verse marks={screen.marks} cue={shownCue(garden, sayIt, screen.marks)} onPeek={onPeek} />
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
    </View>
  );
}

/** The field over the garden read; nothing until a read completed, so it never claims a history it has not read. */
function FieldOf({ onToday }: { readonly onToday: () => void }) {
  const garden = readOf(AsyncResult.value(useAtomValue(gardenView)));
  return Option.match(garden, {
    onNone: () => false,
    onSome: (read) => <FieldScreen field={fieldOf(read, PASSAGES)} onToday={onToday} />,
  });
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
 * the first minute keeps Planted on until Continue. From Today the reader
 * opens the field and comes back, in place: whether it shows is the
 * launch's state, never stored, so every launch opens as above. The root
 * holds Say it's view, so Today comes back as it was, and a recital that
 * starts in the same turn as the tap on the field keeps Today on screen.
 */
export default function Root() {
  const listening = screenOf(AsyncResult.value(useAtomValue(sayItView))).listening;
  const read = openingOf(AsyncResult.value(useAtomValue(gardenView)));
  const [decided, setDecided] = useState<Opening>('pending');
  const [onField, setOnField] = useState(false);
  if (decided === 'pending' && read !== 'pending') setDecided(read);
  if (onField && listening) setOnField(false);
  switch (shownOpening(decided, read)) {
    case 'pending':
      return <Pending />;
    case 'first':
      return <FirstMinute onContinue={() => setDecided('today')} />;
    case 'today':
      if (onField) return <FieldOf onToday={() => setOnField(false)} />;
      return <Today onField={() => setOnField(true)} />;
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
  header: { paddingHorizontal: 24, paddingBottom: 4 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 44,
  },
  scroll: { flex: 1 },
  toField: {
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: 22,
    justifyContent: 'center',
    backgroundColor: color.card,
  },
  toFieldText: { fontSize: 15, fontWeight: '600', color: color.ink },
});
