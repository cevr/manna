/**
 * Say it: Today's one recital, run over the app's one `Dictation`. A press
 * starts a recital of the passage, or finishes the one under way; it never
 * replaces one. Each word the screen newly sees lit gives one soft haptic
 * tick, and a recital whose last word lights finishes itself. A recital
 * that ends `finished` takes the matcher's suggested grade as the reader's
 * choice, which the reader can change; each change of its recall (the
 * first suggestion, a changed grade, a later peek) is handed to `Recalls`
 * once. Every other ending keeps nothing.
 *
 * The ticks follow `Dictation.changes`, the views the screen shows; the
 * endings come from `Dictation.endings`, which loses none, and the n-th
 * ending is the n-th recital's, since no recital is ever replaced.
 */

import { Clock, Context, Effect, Layer, MutableRef, Option, PubSub, Stream } from 'effect';

import { Dictation, type DictationView } from './dictation';
import type { MatcherView, SuggestedGrade } from './matcher';
import { sourceWords } from './matcher/words';
import type { Passage } from './passage';

export type { DictationView } from './dictation';

// oxlint-disable-next-line effect/noNullish -- the screen's view gives an absent start or choice as null, as the dictation view does.
export type OrNull<A> = A | null;

const ABSENT: OrNull<never> = Option.getOrNull(Option.none());

/** FSRS's four grades: Again, Hard, Good and Easy. */
export type Grade = 1 | 2 | 3 | 4;

export const GRADES: readonly Grade[] = [1, 2, 3, 4];

export const GRADE_NAMES: Readonly<Record<Grade, string>> = {
  1: 'Again',
  2: 'Hard',
  3: 'Good',
  4: 'Easy',
};

/** A finished recital as the scheduler takes it: the grade the reader left, the matcher's suggestion, and the counts behind them. */
export interface Recall {
  readonly reference: string;
  readonly startedAt: number;
  readonly grade: Grade;
  readonly suggested: SuggestedGrade;
  readonly words: number;
  readonly missed: number;
  readonly peeked: number;
  readonly extra: number;
}

/** Where a finished recital's recall goes. Each change is kept once, so the last one kept for a `startedAt` is the one the reader left. */
export class Recalls extends Context.Service<
  Recalls,
  { readonly keep: (recall: Recall) => Effect.Effect<void> }
>()('heartseed/sayit/Recalls') {}

/** The soft tick a newly lit word is felt by. */
export class Haptics extends Context.Service<Haptics, { readonly tick: Effect.Effect<void> }>()(
  'heartseed/sayit/Haptics',
) {}

/** What Today shows of Say it: the latest Dictation view it has seen, when the recital started, and the grade chosen for it. */
export interface SayItView {
  readonly dictation: DictationView;
  readonly startedAt: OrNull<number>;
  readonly choice: OrNull<Grade>;
}

export class SayIt extends Context.Service<
  SayIt,
  {
    readonly press: Effect.Effect<void>;
    readonly peek: (index: number) => Effect.Effect<void>;
    readonly choose: (grade: Grade) => Effect.Effect<void>;
    readonly view: Effect.Effect<SayItView>;
    readonly changes: Stream.Stream<SayItView>;
  }
>()('heartseed/sayit/SayIt') {}

/** The views a held subscriber of `changes` keeps: past it, its oldest view slides out, so it always reaches the latest. */
const WINDOW = 16;

/** Whether the word at `index` of `view` is lit: said and final. A negative index counts from the end. */
const isLit = (view: OrNull<MatcherView>, index: number) =>
  view !== ABSENT && view.marks.at(index)?.status === 'matched';

/** The words lit in `after` that were not lit in `before`: one tick each. */
export const ticksOf = (before: OrNull<MatcherView>, after: OrNull<MatcherView>): number => {
  if (after === ABSENT) return 0;
  return after.marks.filter((mark, index) => mark.status === 'matched' && !isLit(before, index))
    .length;
};

/** The recall of a finished recital under `grade`: its words, the words missed (peeked or not), the peeks and the extra words. */
export const recallOf = (
  reference: string,
  startedAt: number,
  grade: Grade,
  suggested: SuggestedGrade,
  view: MatcherView,
): Recall => ({
  reference,
  startedAt,
  grade,
  suggested,
  words: view.marks.length,
  missed: view.marks.filter((mark) => mark.status === 'miss' || mark.status === 'peek').length,
  peeked: view.peekCount,
  extra: view.extraWordCount,
});

const RECALL_FIELDS: readonly (keyof Recall)[] = [
  'reference',
  'startedAt',
  'grade',
  'suggested',
  'words',
  'missed',
  'peeked',
  'extra',
];

const sameRecall = (a: Recall, b: Recall) => RECALL_FIELDS.every((field) => a[field] === b[field]);

const isGrade = (grade: number): grade is Grade => GRADES.some((each) => each === grade);

/** How far the current recital has gone: none yet, under way, ended unheard, or finished with its suggestion and the recall last kept. */
type Recital =
  | { readonly _tag: 'None' }
  | { readonly _tag: 'Open'; readonly startedAt: number }
  | { readonly _tag: 'Unheard' }
  | {
      readonly _tag: 'Finished';
      readonly startedAt: number;
      readonly suggested: SuggestedGrade;
      readonly kept: Option.Option<Recall>;
    };

/** Say it's state: the view, the current recital, the recitals started and the endings read, and the matcher view the screen last showed. */
interface Held {
  readonly view: SayItView;
  readonly recital: Recital;
  readonly started: number;
  readonly endings: number;
  readonly shown: OrNull<MatcherView>;
  /** The last view shown was idle, so the next active one opens a recital and is diffed against nothing. */
  readonly between: boolean;
}

/** What `next` is diffed against for its ticks: nothing when it opens a recital, else the view shown last. */
const lastShown = (held: Held, next: DictationView): OrNull<MatcherView> => {
  if (held.between && next.status !== 'idle') return ABSENT;
  return held.shown;
};

export const layer = (passage: Passage): Layer.Layer<SayIt, never, Dictation | Haptics | Recalls> =>
  Layer.effect(
    SayIt,
    Effect.gen(function* () {
      const dictation = yield* Dictation;
      const haptics = yield* Haptics;
      const recalls = yield* Recalls;
      const sayable = sourceWords(passage.text).length > 0;
      const context = yield* Effect.context<never>();
      /** The time of a press on the service's own clock, whoever runs the press. */
      const now = Effect.provideContext(Clock.currentTimeMillis, context);
      const held = MutableRef.make<Held>({
        view: { dictation: yield* dictation.view, startedAt: ABSENT, choice: ABSENT },
        recital: { _tag: 'None' },
        started: 0,
        endings: 0,
        shown: ABSENT,
        between: true,
      });
      const views = yield* PubSub.sliding<SayItView>({ capacity: WINDOW, replay: 1 });
      yield* PubSub.publish(views, MutableRef.get(held).view);

      /** Changes the state at once, and publishes its view when that changed. */
      const update = (change: (now: Held) => Held) =>
        Effect.suspend(() => {
          const before = MutableRef.get(held);
          const next = change(before);
          MutableRef.set(held, next);
          if (next.view === before.view) return Effect.void;
          return Effect.asVoid(PubSub.publish(views, next.view));
        });

      /** Hands the finished recital's recall to `Recalls`, unless it is the one last kept for it; once marked kept, the hand-over is never cut off. */
      const keep = Effect.gen(function* () {
        const { recital, view } = MutableRef.get(held);
        const { matcher } = yield* dictation.view;
        if (recital._tag !== 'Finished' || view.choice === ABSENT || matcher === ABSENT) return;
        const recall = recallOf(
          passage.reference,
          recital.startedAt,
          view.choice,
          recital.suggested,
          matcher,
        );
        if (Option.exists(recital.kept, (kept) => sameRecall(kept, recall))) return;
        MutableRef.update(held, (now) => ({
          ...now,
          recital: { ...recital, kept: Option.some(recall) },
        }));
        yield* Effect.uninterruptible(recalls.keep(recall));
      });

      /** Applies an ending to the recital under way: a finished one takes its suggestion as the choice and is kept; any other keeps nothing. */
      const close = (ended: DictationView) =>
        Effect.gen(function* () {
          const { recital } = MutableRef.get(held);
          if (recital._tag !== 'Open') return;
          const suggested = ended.matcher?.suggestedGrade ?? ABSENT;
          if (ended.ended !== 'finished' || suggested === ABSENT) {
            yield* update((now) => ({ ...now, recital: { _tag: 'Unheard' } }));
            return;
          }
          yield* update((now) => ({
            ...now,
            recital: {
              _tag: 'Finished',
              startedAt: recital.startedAt,
              suggested,
              kept: Option.none(),
            },
            view: { ...now.view, choice: suggested },
          }));
          yield* keep;
        });

      /** Shows one view: ticks for each word it newly lights, and finishes the recital under way once its last word is lit. */
      const show = (next: DictationView) =>
        Effect.gen(function* () {
          const ticks = ticksOf(lastShown(MutableRef.get(held), next), next.matcher);
          yield* update((now) => ({
            ...now,
            shown: next.matcher,
            between: next.status === 'idle',
            view: { ...now.view, dictation: next },
          }));
          for (let tick = 0; tick < ticks; tick += 1) yield* haptics.tick;
          const current = yield* dictation.view;
          if (current.status === 'listening' && isLit(current.matcher, -1)) yield* dictation.finish;
        });

      /** Reads one ending: it is the recital's under way only when it is the ending for the last recital started. */
      const read = (ended: DictationView) =>
        Effect.suspend(() => {
          const now = MutableRef.get(held);
          const endings = now.endings + 1;
          MutableRef.set(held, { ...now, endings });
          if (endings !== now.started) return Effect.void;
          return close(ended);
        });

      yield* Effect.forkScoped(Stream.runForEach(dictation.changes, show), {
        startImmediately: true,
      });
      yield* Effect.forkScoped(Stream.runForEach(dictation.endings, read), {
        startImmediately: true,
      });

      const press = Effect.gen(function* () {
        const current = yield* dictation.view;
        if (current.status === 'listening') return yield* dictation.finish;
        if (current.status === 'finishing' || !sayable) return;
        yield* close(current);
        const startedAt = yield* now;
        yield* update((now) => ({
          ...now,
          started: now.started + 1,
          recital: { _tag: 'Open', startedAt },
          view: { ...now.view, startedAt, choice: ABSENT },
        }));
        yield* dictation.start(passage.text);
      });

      const choose = (grade: Grade) =>
        Effect.suspend(() => {
          const { recital, view } = MutableRef.get(held);
          if (recital._tag !== 'Finished' || !isGrade(grade) || view.choice === grade)
            return Effect.void;
          return Effect.andThen(
            update((now) => ({ ...now, view: { ...now.view, choice: grade } })),
            keep,
          );
        });

      return SayIt.of({
        press,
        peek: (index) => Effect.andThen(dictation.peek(index), keep),
        choose,
        view: Effect.sync(() => MutableRef.get(held).view),
        changes: Stream.fromPubSub(views),
      });
    }),
  );
