import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { Array as Arr, Match, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'one';
import passage from 'virtual:heartseed-passage';

import type { Choice as AppearanceChoice } from '../src/appearance';
import { useAppearanceShown } from '../src/appearance/shown';
import {
  appearanceView,
  choose,
  gardenView,
  greetingNow,
  holdReading,
  leave,
  letGo,
  listenTo,
  next,
  passagesView,
  peek,
  practiceList,
  press,
  readingAloud,
  sayItView,
  seekTo,
  sessionView,
  startHere,
  taughtView,
  voiceView,
} from '../src/app';
import { AboutScreen, LicencesScreen } from '../src/about/screen';
import { ChooserScreen } from '../src/chooser/screen';
import { fieldOf, type FieldPassage } from '../src/field';
import { removalOf } from '../src/field/plot';
import { FieldScreen } from '../src/field/screen';
import { listStartOf } from '../src/list';
import { ListScreen } from '../src/list/screen';
import { openingOf, shownOpening, type Opening } from '../src/first/flow';
import { themed, useThemed } from '../src/look';
import { Grows, Welcome } from '../src/first/intro';
import { FirstMinute } from '../src/first/screen';
import { tourStep, type Tour, type TourTap } from '../src/first/tour';
import {
  cueIn,
  growthOf,
  stageOf,
  type GardenView,
  type Plant,
  type ReadGarden,
  type Stage,
  withRecall,
} from '../src/garden';
import { MoveBack } from '../src/garden/back';
import { furrowsOf, readyOf } from '../src/home';
import { tendedOf } from '../src/home/grown';
import { PlantImage } from '../src/home/plant';
import { startOf } from '../src/home/start';
import { todayOf } from '../src/home/today';
import type { StartKind } from '../src/field/card';
import type { SessionView, VisitVerse } from '../src/session/service';
import type { Cue, Mark } from '../src/matcher';
import { sourceWords } from '../src/matcher/words';
import { AddSheet } from '../src/shelves/sheet';
import { GRADE_NAMES, GRADES, type Grade, type SayItView } from '../src/sayit';
import { BigButton, Unsaid, useLook, Word } from '../src/sayit/draw';
import { screenOf, wordOf, type Result } from '../src/sayit/screen';
import { fieldPassagesOf } from '../src/promises/taught';
import { countsOf, type Item, type TextPiece } from '../src/session';
import { shownOf, type Shown } from '../src/session/run';
import { useSessionBegunWhenShown } from '../src/session/shown';
import { breaksOf, lineTextsOf, linesOf } from '../src/reading/lines';
import { breakBefore, ReadingView, type Hold } from '../src/reading/view';
import { Tended } from '../src/run/tended';

/** The voice's view as `src/app.ts` gives it: Today names no voice module itself. */
type VoiceView = Parameters<typeof readingAloud>[0];

/** The passages the field shows first: Today's, a passage of one verse. */
const PASSAGES: readonly FieldPassage[] = [
  { title: passage.reference, verses: [passage.reference] },
];

/**
 * The verse under `cue`: while the voice reads this very text and no
 * recital is shown, the reading view, each word lit as it is read
 * (`ReadingView`) under Today's hold (`hold`); else whole under the full text while no recital is
 * shown; else one element per word, each its own accessibility element, a
 * word the recital shown has reached as `wordOf` shows it and every other
 * word as the cue shows it (`Unsaid`): whole or in letters in the cue's ink,
 * or an empty slot. All three draw the verse's lines (`linesOf`): a verse of
 * one line as one run, a longer one with a `break-<k>` row before each line
 * after the first, its plain text as one `line-<i>` text per line. Exported
 * for the test that holds the three drawings to one set of lines.
 */
export function Verse({
  text,
  marks,
  cue,
  voice,
  hold,
  onPeek,
}: {
  readonly text: string;
  readonly marks: Option.Option<readonly Mark[]>;
  readonly cue: Cue;
  readonly voice: Option.Option<VoiceView>;
  readonly hold: Hold;
  readonly onPeek: (index: number) => void;
}) {
  const look = useLook();
  const styles = useThemed(sheets);
  const lines = linesOf(text);
  const breaks = breaksOf(lines);
  const reading = Option.filter(voice, (view) => readingAloud(view) && view.verse === text);
  if (Option.isNone(marks) && Option.isSome(reading))
    return <ReadingView key={text} text={text} view={reading.value} hold={hold} lines={lines} />;
  if (Option.isNone(marks) && cue === 'full' && breaks.size === 0)
    return (
      <Text testID="passage" style={styles.words}>
        {text}
      </Text>
    );
  if (Option.isNone(marks) && cue === 'full')
    return (
      <View testID="passage" style={look.verse}>
        {lineTextsOf(text, lines).flatMap((line, at) => [
          ...breakBefore(breaks, lines[at]?.first ?? 0),
          <Text key={at} testID={`line-${at}`} style={styles.words}>
            {line}
          </Text>,
        ])}
      </View>
    );
  return (
    <View style={look.verse}>
      {sourceWords(text).flatMap((word, index) => {
        const mark = Option.flatMap(marks, (all) => Option.fromNullishOr(all[index]));
        if (Option.isNone(mark) || mark.value.status === 'pending')
          return [
            ...breakBefore(breaks, index),
            <Unsaid key={index} index={index} word={word} cue={cue} onPeek={onPeek} />,
          ];
        return [
          ...breakBefore(breaks, index),
          <Word key={index} shown={wordOf(mark.value, word)} onPeek={onPeek} />,
        ];
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
  const look = useLook();
  const styles = useThemed(sheets);
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

/** The garden Today draws: the read one with the recall pending for the held item laid over it (`withRecall`), so a finished recital reads kept until its `Next` keeps it or a leave lets it go. */
const pendingIn = (
  garden: Option.Option<ReadGarden>,
  session: Option.Option<SessionView>,
  sayIt: Option.Option<SayItView>,
): Option.Option<ReadGarden> =>
  Option.map(garden, (read) =>
    Option.match(
      Option.filter(
        Option.flatMap(sayIt, (view) => Option.fromNullishOr(view.pending)),
        (pending) =>
          Option.exists(
            Option.flatMap(session, (view) => view.held),
            (held) => held.reference === pending.reference,
          ),
      ),
      { onNone: () => read, onSome: (pending) => withRecall(read, pending) },
    ),
  );

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
 * The stage of the verse of `reference`, its plant beside it once planted
 * (still, drawn with the home's hand-drawn set at 28 pt),
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
  const look = useLook();
  const styles = useThemed(sheets);
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
          onSome: (each) => <PlantImage stage={each} size={28} />,
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

/** The way back to home: offered once the garden is read, and never while Say it listens, so leaving Today never leaves a recital listening. */
function FieldControl({ onPress }: { readonly onPress: () => void }) {
  const look = useLook();
  const styles = useThemed(sheets);
  return (
    <Pressable
      role="button"
      aria-label="Your field"
      onPress={onPress}
      style={({ pressed }) => [styles.toField, pressed && look.pressed]}
    >
      <Text style={styles.toFieldText}>‹ Your field</Text>
    </Pressable>
  );
}

/**
 * The session's counts line over the plan made in this launch and the
 * garden now: what is left to tend, the new piece, and about how long they
 * take. It claims nothing until a plan is made, and none is made in an
 * unread garden.
 */
function Counts({ garden }: { readonly garden: Option.Option<ReadGarden> }) {
  const styles = useThemed(sheets);
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
 * Today: its header (the heading and the way back to home, wrapping under
 * the heading when the text is large), fixed above a scroll view of the session's counts
 * line, the verse the run shows, its stage and the alert, and a footer
 * fixed under the scroll view: `Move back a stage` (`MoveBack`) on a planted
 * verse of the visit, a tap's, at rest (no recital under way, held or done),
 * the result's grades, Listen on the plan's
 * new piece while the voice is on and reads nothing, and the action button.
 * Its first show with the garden read makes the launch's plan, unless home
 * made it first; a later show finds it made. The run shows one item at a time:
 * Say it holds it, and once its recital finished with a recall (never at a
 * recital's end alone) the button reads Next. That recall waits: Today
 * draws it laid over the garden (`pendingIn`), and only `Next` keeps it
 * and lets the item go; `Your field` lets both go, so leaving records
 * nothing and the verse stays as it was. With every item of a run
 * that is not empty done and none held (`tendedOf`), the heading reads
 * `The field is tended` and the scroll holds the end's drawing alone
 * (`Tended`): what grew, with the header's way to the field the only
 * control. With a run that is empty, the scroll holds the counts line alone.
 * Either way there is no button. A recital's marks, result and alert show only while its item is
 * held, or with no plan.
 * Today keeps the reading view's hold: the word a finger holds while a
 * reading is under way, and while one is held the scroll view stands still
 * (`scrollEnabled` off), so a drag across the words seeks and never scrolls.
 * Every control but a missed word's mark sits outside the scroll view, so
 * however long the verse or the result, they are on screen without a
 * scroll and clear of the home indicator.
 */
function Today({ onField }: { readonly onField: () => void }) {
  const look = useLook();
  const styles = useThemed(sheets);
  const insets = useSafeAreaInsets();
  const sayIt = AsyncResult.value(useAtomValue(sayItView));
  const read = readOf(AsyncResult.value(useAtomValue(gardenView)));
  const session = AsyncResult.value(useAtomValue(sessionView));
  const garden = pendingIn(read, session, sayIt);
  const screen = screenOf(sayIt);
  const onPress = useAtomSet(press);
  const onNext = useAtomSet(next);
  const onLeave = useAtomSet(leave);
  const onPeek = useAtomSet(peek);
  const onChoose = useAtomSet(choose);
  const onListen = useAtomSet(listenTo);
  const voice = AsyncResult.value(useAtomValue(voiceView));
  const voiceFree = Option.exists(voice, (view) => view.enabled && !readingAloud(view));
  const [heldWord, setHeld] = useState<Option.Option<number>>(Option.none());
  const held = Option.filter(heldWord, () => Option.exists(voice, readingAloud));
  const onHold = useAtomSet(holdReading);
  const onSeek = useAtomSet(seekTo);
  const onLetGo = useAtomSet(letGo);
  const hold: Hold = { held, onHeld: setHeld, onHold, onSeek, onLetGo };
  useSessionBegunWhenShown(Option.isSome(read));
  const showing = showingOf(Option.map(session, (view) => shownOf(view, garden)));
  const recital = Option.exists(showing, (each) => each.recital);
  const shownSayIt = Option.filter(sayIt, () => recital);
  const marks = Option.filter(screen.marks, () => recital);
  const tended = Option.flatMap(session, (view) => tendedOf(view, garden));
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
            {Option.match(tended, {
              onNone: () => 'Today',
              onSome: () => 'The field is tended',
            })}
          </Text>
          {!screen.listening && (
            <View style={styles.ways}>
              {Option.isSome(garden) && (
                <FieldControl
                  onPress={() => {
                    onLeave();
                    onField();
                  }}
                />
              )}
            </View>
          )}
        </View>
      </View>
      <ScrollView
        scrollEnabled={Option.isNone(held)}
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
        {Option.match(tended, {
          onNone: () => <Counts garden={garden} />,
          onSome: (grown) => <Tended grown={grown} />,
        })}
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
                voice={voice}
                hold={hold}
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
              Option.filter(
                Option.flatMap(garden, (read) => plantIn(read, each.piece.reference)),
                () =>
                  !screen.listening &&
                  !each.recital &&
                  !each.done &&
                  Option.exists(session, (view) =>
                    view.visit.some((verse) => verse.piece.reference === each.piece.reference),
                  ),
              ),
              {
                onNone: () => false,
                onSome: (plant) => (
                  <MoveBack
                    key={each.piece.reference}
                    reference={each.piece.reference}
                    stage={stageOf(plant)}
                  />
                ),
              },
            )}
            {Option.match(
              Option.filter(screen.result, () => recital),
              {
                onNone: () => false,
                onSome: (result) => <Grades result={result} onChoose={onChoose} />,
              },
            )}
            {voiceFree && offersListen(screen.listening, each) && (
              <BigButton
                label="Listen"
                busy={false}
                pressable
                onPress={() => onListen(each.piece.text)}
              />
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

/** Whether the run's shown item offers Listen, with the voice on and free: only the plan's new piece, while its button reads Say it (never on a review, whose cue a reading would give away, at Next or while a recital is under way). */
const offersListen = (listening: boolean, each: Showing) =>
  !listening && !each.done && Option.exists(each.item, (item) => item.fresh);

/** What a tap on a plant starts on its verse, to the reader: learning it new for a fresh item, else practising it. */
const startKindOf = (visit: VisitVerse): StartKind => {
  if (visit.item.fresh) return 'Learn';
  return 'Practice';
};

/**
 * Home: the field over the garden read, the reader's passages, the
 * collections taught, the session's view and the greeting by the runtime's
 * clock. Its first show begins the session, so the launch's plan is made at
 * that instant, and it shows the pending frame until all are known and,
 * with the passages read, the plan is made: it never claims a history it
 * has not read, a frame without the reader's rows, or a run before the plan
 * that decides it. Its furrows' ready marks are the plan's open verses;
 * the Today card is `todayOf`'s: `Start` opens Today, writing nothing, and
 * `Practice anyway` and a tap on a plant make what `startOf` starts on
 * their verse the session's visit, then show
 * Today once it is made (or failed), so Today never shows the plan's item
 * first. While `adding`, the Add a list sheet shows over it on the same
 * field, in the same place in the tree, so home's own state stays while
 * the sheet opens and closes.
 */
function FieldOf({
  adding,
  tips,
  onToday,
  onAdd,
  onAddDone,
  onAny,
  onAbout,
  onHow,
  onGotIt,
  onOpen,
}: {
  readonly adding: boolean;
  readonly tips: boolean;
  readonly onToday: () => void;
  readonly onAdd: () => void;
  readonly onAddDone: () => void;
  readonly onAny: () => void;
  readonly onAbout: () => void;
  readonly onHow: () => void;
  readonly onGotIt: () => void;
  readonly onOpen: (id: string) => void;
}) {
  const garden = readOf(AsyncResult.value(useAtomValue(gardenView)));
  const passages = AsyncResult.value(useAtomValue(passagesView));
  const taught = AsyncResult.value(useAtomValue(taughtView));
  const session = AsyncResult.value(useAtomValue(sessionView));
  const greeting = AsyncResult.value(useAtomValue(greetingNow));
  const start = useAtomSet(startHere, { mode: 'promise' });
  useSessionBegunWhenShown(Option.isSome(garden));
  const onStart = (verse: string) => {
    void start(verse).then(onToday, onToday);
  };
  const ready = Option.filter(
    Option.all({ garden, passages, taught, session, greeting }),
    (each) => each.passages._tag === 'Unread' || Option.isSome(each.session.plan),
  );
  return Option.match(ready, {
    onNone: () => <Pending />,
    onSome: (known) => {
      const lists = fieldPassagesOf(PASSAGES, known.passages, known.taught);
      const field = fieldOf(known.garden, lists);
      return (
        <>
          <FieldScreen
            field={field}
            furrows={furrowsOf(known.garden, lists, readyOf(known.session.plan, known.garden))}
            passages={known.passages}
            greeting={known.greeting}
            card={todayOf(known.session, known.garden, known.passages._tag === 'Unread')}
            starts={(verse) => Option.map(startOf(known.session, known.garden, verse), startKindOf)}
            tips={tips}
            onToday={onToday}
            onStart={onStart}
            onAdd={onAdd}
            onAbout={onAbout}
            onHow={onHow}
            onGotIt={onGotIt}
            onOpen={onOpen}
          />
          {adding && (
            <AddSheet
              field={field}
              passages={known.passages}
              onDone={onAddDone}
              onAny={onAny}
              onAdded={onAddDone}
            />
          )}
        </>
      );
    },
  });
}

/**
 * A list's own page (`ListScreen`) over the furrow of id `id` as home
 * draws it now: the same garden read, passages, collections taught and
 * session's view as home, read the same way, its first show beginning the
 * session as home's does. `Practice this list` makes what `listStartOf`
 * starts the session's visit and a row's tap what `startOf` starts, then
 * each shows Today once it is made (or failed); `Your field` and a landed
 * remove show home. While any of these is unknown it shows the pending
 * frame; once the id names no furrow (its list removed) it shows `home`
 * in its place, whose every way on sets the root's screen anew.
 */
function ListOf({
  id,
  home,
  onField,
  onToday,
}: {
  readonly id: string;
  readonly home: ReactNode;
  readonly onField: () => void;
  readonly onToday: () => void;
}) {
  const garden = readOf(AsyncResult.value(useAtomValue(gardenView)));
  const passages = AsyncResult.value(useAtomValue(passagesView));
  const taught = AsyncResult.value(useAtomValue(taughtView));
  const session = AsyncResult.value(useAtomValue(sessionView));
  const practice = useAtomSet(practiceList, { mode: 'promise' });
  const start = useAtomSet(startHere, { mode: 'promise' });
  useSessionBegunWhenShown(Option.isSome(garden));
  const known = Option.filter(
    Option.all({ garden, passages, taught, session }),
    (each) => each.passages._tag === 'Unread' || Option.isSome(each.session.plan),
  );
  const furrow = Option.flatMap(known, (each) =>
    Arr.findFirst(
      furrowsOf(
        each.garden,
        fieldPassagesOf(PASSAGES, each.passages, each.taught),
        readyOf(each.session.plan, each.garden),
      ),
      (row) => row.id === id,
    ),
  );
  if (Option.isSome(known) && Option.isNone(furrow)) return home;
  return Option.match(Option.all({ known, furrow }), {
    onNone: () => <Pending />,
    onSome: ({ known: each, furrow: row }) => {
      const verses = row.plants.map((plant) => plant.reference);
      return (
        <ListScreen
          furrow={row}
          start={listStartOf(each.session, each.garden, verses)}
          starts={(verse) => Option.isSome(startOf(each.session, each.garden, verse))}
          removal={Option.filter(removalOf(row), () => each.passages._tag === 'Read')}
          onField={onField}
          onPractice={() => void practice(verses).then(onToday, onToday)}
          onStart={(verse) => void start(verse).then(onToday, onToday)}
          onRemoved={onField}
        />
      );
    },
  });
}

/** The frame a launch shows until the garden's read decides the screen: the reference alone, with no heading, button or claim. */
function Pending() {
  const look = useLook();
  const insets = useSafeAreaInsets();
  return (
    <View style={[look.screen, look.content, { paddingTop: insets.top + 16 }]}>
      <Text testID="reference" style={look.reference}>
        {passage.reference}
      </Text>
    </View>
  );
}

/** The root's screens once the launch has opened, home being `field`, `add` home with the Add verses sheet open, and `list` the list view of the furrow last opened. */
type Screen = 'today' | 'field' | 'add' | 'choose' | 'about' | 'licences' | 'list';

/** The screen an opening shows first: home for `home`, else Today. */
const screenAt = (shown: Opening): Screen => {
  if (shown === 'home') return 'field';
  return 'today';
};

/**
 * The root: the pending frame until the reader's appearance and the
 * garden's read complete, then the first minute when the read holds no
 * recall of any verse, home when it holds one, and Today in an unread
 * garden. The opening is decided once per launch, at the read: planting the
 * seed inside the first minute keeps Planted on until Continue, which shows
 * home. After it, the root shows one screen in place: home (back
 * from Today's `Your field`), with the Add a list sheet over it from home's
 * `Add a list` until the sheet's `Done` or a landed plant, a list's own
 * page (from its furrow's `Open <title>`, back to home), Today (from the
 * Today card's `Start` or `Practice anyway`, a tap on a plant, or a list
 * page's `Practice this list` or a tap on its row), the chooser (from the
 * sheet's `Any passage`, back to the sheet from its first back, home once
 * a passage is added) and About (from the `About` of home's Settings
 * sheet, back to home), whose `Licences` shows the licences (back to
 * About).
 * Beside the screen it holds the tour (`../src/first/tour`): Planted's
 * `Continue` shows home with its tips; home's `How Heartseed works` and
 * the sheet's `Show the welcome again` replay the welcome and how a verse
 * grows in home's place; and every change of the screen away from home,
 * the forced Today among them, ends the tour.
 * Which one shows is the launch's state, never stored and with no route of
 * its own, so every launch opens as above. Whenever Say it listens the
 * screen is Today. `Your field` lets a recital waiting for `Next` go
 * unrecorded (`leave`), so Today comes back offering `Say it` on that
 * verse; a recital that starts in the same turn as the tap on
 * `Your field` keeps Today on screen.
 */
export default function Root() {
  const listening = screenOf(AsyncResult.value(useAtomValue(sayItView))).listening;
  const appearance = AsyncResult.value(useAtomValue(appearanceView));
  const garden = openingOf(AsyncResult.value(useAtomValue(gardenView)));
  const read = Option.match(appearance, { onNone: (): Opening => 'pending', onSome: () => garden });
  const [decided, setDecided] = useState<Opening>('pending');
  const [screen, setScreen] = useState<Screen>('field');
  const [list, setList] = useState('');
  useAppearanceShown(Option.getOrElse(appearance, (): AppearanceChoice => 'system'));
  if (decided === 'pending' && read !== 'pending') {
    setDecided(read);
    setScreen(screenAt(read));
  }
  const [tour, setTour] = useState<Tour>('off');
  const tapTour = (tap: TourTap) => setTour((now) => tourStep(now, tap));
  if (screen !== 'today' && listening) {
    setScreen('today');
    tapTour('Leave');
  }
  /** Shows `next`; any screen but home ends the tour. */
  const show = (next: Screen) => {
    setScreen(next);
    if (next !== 'field' && next !== 'add') tapTour('Leave');
  };
  const onContinue = () => {
    setDecided('home');
    show(screenAt('home'));
    tapTour('Continue');
  };
  const toField = () => show('field');
  const toToday = () => show('today');
  switch (shownOpening(decided, read)) {
    case 'pending':
      return <Pending />;
    case 'first':
      return <FirstMinute onContinue={onContinue} />;
    case 'home':
    case 'today': {
      if (screen === 'field' && tour === 'welcome')
        return (
          <Welcome run="replay" onBegin={() => tapTour('Begin')} onSkip={() => tapTour('Skip')} />
        );
      if (screen === 'field' && tour === 'grows')
        return <Grows run="replay" onOn={() => tapTour('See')} />;
      const home = (
        <FieldOf
          adding={screen === 'add'}
          tips={tour === 'tips'}
          onToday={toToday}
          onAdd={() => show('add')}
          onAddDone={toField}
          onAny={() => show('choose')}
          onAbout={() => show('about')}
          onHow={() => tapTour('How')}
          onGotIt={() => tapTour('GotIt')}
          onOpen={(id) => {
            setList(id);
            show('list');
          }}
        />
      );
      if (screen === 'list')
        return <ListOf id={list} home={home} onField={toField} onToday={toToday} />;
      const pages: Partial<Record<Screen, () => ReactNode>> = {
        about: () => <AboutScreen onField={toField} onLicences={() => show('licences')} />,
        licences: () => <LicencesScreen onAbout={() => show('about')} />,
        choose: () => <ChooserScreen onBack={() => show('add')} onAdded={toField} />,
      };
      if (screen === 'field' || screen === 'add') return home;
      return Option.match(Option.fromUndefinedOr(pages[screen]), {
        onSome: (page) => page(),
        onNone: () => <Today onField={toField} />,
      });
    }
  }
}

const sheets = themed((color, face) =>
  StyleSheet.create({
    passage: { gap: 10 },
    counts: {
      fontFamily: face,
      fontSize: 15,
      fontWeight: '600',
      color: color.ink,
      marginBottom: 12,
    },
    words: { fontFamily: face, fontSize: 24, lineHeight: 36, color: color.ink },
    result: { gap: 10, padding: 16, borderRadius: 20, backgroundColor: color.card },
    suggested: { fontFamily: face, fontSize: 15, color: color.quiet },
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
    gradeName: { fontFamily: face, fontSize: 15, fontWeight: '600', color: color.ink },
    chosenName: { color: color.onInk },
    growing: { gap: 4, marginTop: 4 },
    growth: { fontFamily: face, fontSize: 15, fontWeight: '600', color: color.ink },
    header: { paddingHorizontal: 24, paddingBottom: 4, gap: 8 },
    headerRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      minHeight: 44,
    },
    ways: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    scroll: { flex: 1 },
    footer: { paddingHorizontal: 24, paddingTop: 12, gap: 12 },
    toField: {
      minHeight: 44,
      paddingHorizontal: 20,
      borderRadius: 22,
      justifyContent: 'center',
      backgroundColor: color.card,
    },
    toFieldText: { fontFamily: face, fontSize: 15, fontWeight: '600', color: color.ink },
  }),
);
