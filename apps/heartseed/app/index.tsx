import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { Match, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'one';
import passage from 'virtual:heartseed-passage';

import {
  choose,
  chooseMinutes,
  gardenView,
  next,
  peek,
  press,
  sayItView,
  sessionView,
  toggleVoice,
  voiceView,
} from '../src/app';
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
import { countsOf, MINUTES, type Item, type TextPiece } from '../src/session';
import { shownOf, type Shown } from '../src/session/run';
import { useSessionBegunWhenShown } from '../src/session/shown';

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
  text,
  marks,
  cue,
  onPeek,
}: {
  readonly text: string;
  readonly marks: Option.Option<readonly Mark[]>;
  readonly cue: Cue;
  readonly onPeek: (index: number) => void;
}) {
  if (Option.isNone(marks) && cue === 'full')
    return (
      <Text testID="passage" style={styles.words}>
        {text}
      </Text>
    );
  return (
    <View style={look.verse}>
      {sourceWords(text).map((word, index) => {
        const mark = Option.flatMap(marks, (all) => Option.fromNullishOr(all[index]));
        if (Option.isNone(mark) || mark.value.status === 'pending')
          return <Unsaid key={index} index={index} word={word} cue={cue} onPeek={onPeek} />;
        return <Word key={index} shown={wordOf(mark.value, word)} onPeek={onPeek} />;
      })}
    </View>
  );
}

/**
 * The cue Today shows the verse of `reference` under: a recital's own while
 * one is shown (its marks), else the one the garden's ladder gives it now,
 * and the full text in an unread garden, which shows the verse whole and
 * claims no stage.
 */
const shownCue = (
  reference: string,
  garden: Option.Option<ReadGarden>,
  sayIt: Option.Option<SayItView>,
  marks: Option.Option<readonly Mark[]>,
): Cue => {
  if (Option.isSome(marks) && Option.isSome(sayIt)) return sayIt.value.cue;
  return Option.match(garden, {
    onNone: (): Cue => 'full',
    onSome: (read) => cueIn(read, reference),
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

/** The plant of `reference` in the garden read, none before its first recital. */
const plantIn = (garden: ReadGarden, reference: string) =>
  Option.fromNullishOr(garden.plants.get(reference));

/** The stage the finished recital Today shows grew the verse's plant to, none when it grew nothing or none is shown. */
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
 * The stage of the verse of `reference`, its plant beside it once planted,
 * and how the recital shown grew it. Until a read of the garden completes,
 * and for the session when it failed, it claims nothing: the row holds its
 * place empty, so a planted verse never reads as not planted.
 */
function Growing({
  reference,
  garden,
  sayIt,
}: {
  readonly reference: string;
  readonly garden: Option.Option<ReadGarden>;
  readonly sayIt: Option.Option<SayItView>;
}) {
  if (Option.isNone(garden))
    return (
      <View style={styles.growing}>
        <View style={look.stageRow} />
      </View>
    );
  const plant = plantIn(garden.value, reference);
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

/** A pill of the header's second row: at least 44 pt tall, filled in ink when chosen or on. */
function Pill({
  role,
  label,
  on,
  onPress,
}: {
  readonly role: 'radio' | 'switch';
  readonly label: string;
  readonly on: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      role={role}
      aria-label={label}
      aria-checked={on}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, on && styles.chosen, pressed && look.pressed]}
    >
      <Text style={[styles.gradeName, on && styles.chosenName]}>{label}</Text>
    </Pressable>
  );
}

/**
 * The reader's choices, in the header's second row: the session's minutes,
 * shown once the stored choice is read so the first frame shows the value
 * read, and the voice's switch for new verses, shown once its switch is
 * read. Both stay while Say it listens, and in an unread garden.
 */
function Choices() {
  const session = AsyncResult.value(useAtomValue(sessionView));
  const voice = AsyncResult.value(useAtomValue(voiceView));
  const onMinutes = useAtomSet(chooseMinutes);
  const onVoice = useAtomSet(toggleVoice);
  return (
    <View style={styles.choices}>
      {Option.match(session, {
        onNone: () => false,
        onSome: ({ minutes }) => (
          <View role="radiogroup" aria-label="Minutes" style={styles.choices}>
            {MINUTES.map((each) => (
              <Pill
                key={each}
                role="radio"
                label={`${each} min`}
                on={minutes === each}
                onPress={() => onMinutes(each)}
              />
            ))}
          </View>
        ),
      })}
      {Option.match(voice, {
        onNone: () => false,
        onSome: ({ enabled }) => (
          <Pill role="switch" label="Voice" on={enabled} onPress={() => onVoice()} />
        ),
      })}
    </View>
  );
}

/**
 * The session's counts line over the plan made in this launch and the
 * garden now: what is left to tend, the new piece, and about how long they
 * take. It claims nothing until a plan is made, and none is made in an
 * unread garden.
 */
function Counts({ garden }: { readonly garden: Option.Option<ReadGarden> }) {
  const plan = Option.flatMap(AsyncResult.value(useAtomValue(sessionView)), (view) => view.plan);
  return Option.match(Option.all({ garden, plan }), {
    onNone: () => false,
    onSome: (shown) => (
      <Text testID="session" style={styles.counts}>
        {countsOf(shown.plan, shown.garden)}
      </Text>
    ),
  });
}

/** The verse Today shows and the item of the run it is, if any, and whether a recital of it shows: always with no plan, else only while it is held. */
interface Showing {
  readonly piece: TextPiece;
  readonly item: Option.Option<Item>;
  readonly recital: boolean;
  readonly done: boolean;
}

/** The verse Today shows of the run, none in the done state (and before the session's view is read). */
const showingOf = (shown: Option.Option<Shown>): Option.Option<Showing> =>
  Option.flatMap(
    shown,
    Match.type<Shown>().pipe(
      Match.tagsExhaustive({
        Unplanned: (each): Option.Option<Showing> =>
          Option.map(each.piece, (piece) => ({
            piece,
            item: Option.none(),
            recital: true,
            done: false,
          })),
        Item: (each): Option.Option<Showing> =>
          Option.some({
            piece: each.piece,
            item: Option.some(each.item),
            recital: each.held,
            done: each.done,
          }),
        Done: (): Option.Option<Showing> => Option.none(),
      }),
    ),
  );

/**
 * Today: its header (the heading and the way to the field, and under them
 * the reader's choices), fixed above a scroll view of the session's counts
 * line, the verse the run shows, its stage and the alert, and a footer
 * fixed under the scroll view: the result's grades and the action button.
 * Its first show with the garden read makes the launch's plan; a later
 * show, after the field, finds it made. The run shows one item at a time:
 * Say it holds it, and once its recall is kept (never at a recital's end
 * alone) the button reads Next, which lets it go. With every item done and
 * none held, the scroll holds the counts line alone, and there is no
 * button. A recital's marks, result and alert show only while its item is
 * held, or with no plan.
 * Every control but a missed word's mark sits outside the scroll view, so
 * however long the verse or the result, they are on screen without a
 * scroll and clear of the home indicator.
 */
function Today({ onField }: { readonly onField: () => void }) {
  const insets = useSafeAreaInsets();
  const sayIt = AsyncResult.value(useAtomValue(sayItView));
  const garden = readOf(AsyncResult.value(useAtomValue(gardenView)));
  const session = AsyncResult.value(useAtomValue(sessionView));
  const screen = screenOf(sayIt);
  const onPress = useAtomSet(press);
  const onNext = useAtomSet(next);
  const onPeek = useAtomSet(peek);
  const onChoose = useAtomSet(choose);
  useSessionBegunWhenShown(Option.isSome(garden));
  const showing = showingOf(Option.map(session, (view) => shownOf(view, garden)));
  const recital = Option.exists(showing, (each) => each.recital);
  const shownSayIt = Option.filter(sayIt, () => recital);
  const marks = Option.filter(screen.marks, () => recital);
  const onAction = (each: Showing) => {
    if (screen.listening) return onPress({ piece: each.piece, item: Option.none() });
    if (each.done) return onNext();
    return onPress({ piece: each.piece, item: each.item });
  };
  return (
    <View style={look.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerRow}>
          <Text role="heading" aria-level={1} style={look.title}>
            Today
          </Text>
          {Option.isSome(garden) && !screen.listening && <FieldControl onPress={onField} />}
        </View>
        <Choices />
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          look.content,
          {
            paddingTop: 16,
            paddingBottom: Option.match(showing, {
              onNone: () => insets.bottom + 16,
              onSome: () => 16,
            }),
          },
        ]}
      >
        <Counts garden={garden} />
        {Option.match(showing, {
          onNone: () => false,
          onSome: ({ piece }) => (
            <View style={styles.passage}>
              <Text testID="reference" style={look.reference}>
                {piece.reference}
              </Text>
              <Verse
                text={piece.text}
                marks={marks}
                cue={shownCue(piece.reference, garden, shownSayIt, marks)}
                onPeek={onPeek}
              />
              <Growing reference={piece.reference} garden={garden} sayIt={shownSayIt} />
            </View>
          ),
        })}
        {Option.match(
          Option.filter(screen.alert, () => recital),
          {
            onNone: () => false,
            onSome: (alert) => (
              <Text role="alert" style={look.alert}>
                {alert}
              </Text>
            ),
          },
        )}
      </ScrollView>
      {Option.match(showing, {
        onNone: () => false,
        onSome: (each) => (
          <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
            {Option.match(
              Option.filter(screen.result, () => recital),
              {
                onNone: () => false,
                onSome: (result) => <Grades result={result} onChoose={onChoose} />,
              },
            )}
            <BigButton
              label={actionOf(screen.listening, each.done)}
              busy={screen.listening}
              pressable={screen.pressable}
              onPress={() => onAction(each)}
            />
          </View>
        ),
      })}
    </View>
  );
}

/** The action button's name: Listening while a recital is under way, else Next once the item shown is done, else Say it. */
const actionOf = (listening: boolean, done: boolean) => {
  if (listening) return 'Listening';
  if (done) return 'Next';
  return 'Say it';
};

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
  counts: { fontSize: 15, fontWeight: '600', color: color.ink, marginBottom: 12 },
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
  header: { paddingHorizontal: 24, paddingBottom: 4, gap: 8 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.card,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 44,
  },
  scroll: { flex: 1 },
  footer: { paddingHorizontal: 24, paddingTop: 12, gap: 12 },
  toField: {
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: 22,
    justifyContent: 'center',
    backgroundColor: color.card,
  },
  toFieldText: { fontSize: 15, fontWeight: '600', color: color.ink },
});
