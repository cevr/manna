/**
 * The garden's calls, each one program the runner runs for one Exact call.
 * The current Heartseed's own services do the work: its `Garden` (the
 * plants, their stages, FSRS and the steps back), its `Recalls` and `Backs`,
 * and its `Passages` (the lists and the single verses). A call builds them over Effect's `KeyValueStore` on one
 * file of Exact's storage (`@manna/exact-kit/storage`), so their layers live
 * for that call alone: each reads the store as the current app does at
 * launch, the call makes its one change, and it answers what the services
 * hold after it. Nothing of a call outlives it but the file.
 *
 * The rules of help (hspeek) are the current app's: a recall's grade is
 * held to the help's cap by `cappedBy`, the cap no better than Hard after a
 * peek (`PEEK_CAP`) and no better than `shownAllCap` of the verse's stage
 * after Show all, and Show all's step back is kept first, at its instant,
 * through `Backs`, which moves a verse past a seed one stage down
 * (`backOf`). Time is the call's: the runner's clock reads the call's `now`.
 */

import { layerFile, type FileStorage } from '@manna/exact-kit/storage';
import {
  backOf,
  Backs,
  Chime,
  Garden,
  layer as gardenLayer,
  shownAllCap,
  stageOf,
  type BackAnswer,
  type GardenView,
  type Stage,
} from '@manna/heartseed/garden';
import { listsOf, placeOf } from '@manna/heartseed/lists';
import {
  layer as passagesLayer,
  Passages,
  verseCount,
  type PassagesView,
  type Range,
} from '@manna/heartseed/passages';
import {
  cappedBy,
  PEEK_CAP,
  Recalls,
  type Grade,
  type Help,
  type Recall,
} from '@manna/heartseed/sayit';
import { Effect, Layer, Option } from 'effect';
import type * as KeyValueStore from 'effect/persistence/KeyValueStore';

import { plantIn } from './view';

/** The file the garden's keys are kept in. */
export const GARDEN_FILE = 'app:/data/heartseed.json';

/** What a call holds once its services are read: the garden, the lists, and the single verses (none while the lists are unread). */
export interface Held {
  readonly garden: GardenView;
  readonly passages: PassagesView;
  readonly singles: Option.Option<readonly Range[]>;
}

/** A plant's answer, in the order a plant judges them. */
export type PlantAnswer =
  | 'Planted'
  | 'Already'
  | 'Short'
  | 'Full'
  | 'Invalid'
  | 'Unread'
  | 'Failed';

/** A remove's answer. */
export type RemoveAnswer = 'Removed' | 'Absent' | 'Unread' | 'Failed';

/** A recall's answer: `Kept` once its record is in the plant, `Unread` when the garden could not be read (the record is written all the same). */
export type RecallAnswer = 'Kept' | 'Unread' | 'Failed';

/** The services a call's program runs over. */
type Grounds = Garden | Recalls | Backs | Passages | KeyValueStore.KeyValueStore;

const silentChime = Layer.succeed(Chime, Chime.of({ grow: () => Effect.void }));

/** The current app's services over the store at `storage`'s garden file, for one call. */
const groundsOf = (storage: FileStorage) =>
  Layer.mergeAll(gardenLayer.pipe(Layer.provide(silentChime)), passagesLayer).pipe(
    Layer.provideMerge(layerFile(storage, GARDEN_FILE)),
  );

/** The single verses `view` holds; none while it is unread. */
const singlesOf = (view: PassagesView): Option.Option<readonly Range[]> => {
  if (view._tag === 'Unread') return Option.none();
  return Option.some(view.singles);
};

/** What the services hold now. */
const held = Effect.gen(function* () {
  const garden = yield* Effect.flatMap(Garden, (each) => each.view);
  const passages = yield* Effect.flatMap(Passages, (each) => each.view);
  return { garden, passages, singles: singlesOf(passages) } satisfies Held;
});

/** `program` over the services of one call, then what they hold after it. */
const withGrounds = <A>(storage: FileStorage, program: Effect.Effect<A, never, Grounds>) =>
  Effect.gen(function* () {
    const answer = yield* program;
    return { answer, held: yield* held };
  }).pipe(Effect.provide(groundsOf(storage)));

/** The garden as it is. */
export const readGarden = (storage: FileStorage) =>
  withGrounds(storage, Effect.void).pipe(Effect.map(({ held: now }) => now));

/** Plants `range`: one verse joins the single verses (`Passages.join`); any other range is a list (`Passages.add`, which answers `Short` under the fewest a list holds). */
export const plantRange = (storage: FileStorage, range: Range) =>
  withGrounds(
    storage,
    Effect.gen(function* () {
      const passages = yield* Passages;
      if (verseCount(range) === 1) {
        const joined = yield* passages.join(range);
        if (joined === 'Added') return 'Planted' satisfies PlantAnswer;
        if (joined === 'Held') return 'Already' satisfies PlantAnswer;
        return joined;
      }
      const added = yield* passages.add(range);
      if (added === 'Added') return 'Planted' satisfies PlantAnswer;
      return added;
    }),
  );

/** The prefix of a single verse's id: `single:<reference>`. */
export const SINGLE = 'single:';

/** The single verse `single:<reference>` names, as its one-verse range. */
const singleOf = (id: string): Option.Option<Range> =>
  Option.liftPredicate(id, (each) => each.startsWith(SINGLE)).pipe(
    Option.flatMap((each) => placeOf(each.slice(SINGLE.length))),
    Option.map((place) => ({
      book: place.book,
      chapter: place.chapter,
      first: place.verse,
      last: place.verse,
    })),
  );

/** Removes the list `id` (a range's or a Handbook list's), or the single verse `single:<reference>`. */
export const removeById = (storage: FileStorage, id: string) =>
  withGrounds(
    storage,
    Effect.gen(function* () {
      const passages = yield* Passages;
      const single = singleOf(id);
      if (Option.isSome(single)) return yield* passages.part(single.value);
      const view = yield* passages.view;
      if (view._tag === 'Unread') return 'Unread' satisfies RemoveAnswer;
      return yield* Option.match(
        Option.fromUndefinedOr(listsOf([], view, []).find((each) => each.id === id)),
        {
          onNone: () => Effect.succeed<RemoveAnswer>('Absent'),
          onSome: (list) => {
            if (list.source._tag === 'Passage') return passages.remove(list.source.range);
            return passages.uproot(id);
          },
        },
      );
    }),
  );

/** A recital's recall as a caller hands it: SayIt's recall of the verse, its peeks at rest counted. */
export type RecallIn = Omit<Recall, 'reference'>;

/** The help taken before the try, as SayIt holds it. */
export type HelpIn = Omit<Help, 'reference'>;

/** The better of two grades' caps: the lower grade. */
const lower = (a: Grade, b: Grade): Grade => {
  if (a <= b) return a;
  return b;
};

/** The best grade no help leaves alone: Easy. */
const UNCAPPED: Grade = 4;

/** The cap a peek at rest sets: Hard, once any word was peeked. */
const peekCapOf = (help: HelpIn): Grade => {
  if (help.peeked.length > 0) return PEEK_CAP;
  return UNCAPPED;
};

/** The cap Show all sets on a verse at `stage`; none for no Show all, or a verse not yet planted, which Show all does not move. */
const shownCapOf = (help: HelpIn, stage: Option.Option<Stage>): Grade => {
  if (Option.isNone(Option.fromNullishOr(help.shownAt))) return UNCAPPED;
  return Option.match(stage, { onNone: () => UNCAPPED, onSome: shownAllCap });
};

/** The garden's view in this call. */
const gardenView = Effect.flatMap(Garden, (garden) => garden.view);

/**
 * Keeps the recall of `reference`: with Show all taken on a planted verse,
 * its step back first, at its instant; then the recall, its grade held to
 * the help's cap, the cap itself no better than the help's peeks and Show
 * all allow.
 */
export const recallVerse = (
  storage: FileStorage,
  reference: string,
  recall: RecallIn,
  help: Option.Option<HelpIn>,
) =>
  withGrounds(
    storage,
    Effect.gen(function* () {
      const stage = Option.map(plantIn(yield* gardenView, reference), stageOf);
      const taken = Option.map(help, (each): Help => ({
        ...each,
        reference,
        cap: lower(each.cap, lower(peekCapOf(each), shownCapOf(each, stage))),
      }));
      const shownAt = Option.flatMap(taken, (each) => Option.fromNullishOr(each.shownAt));
      const movable = Option.filter(stage, (from) => Option.isSome(backOf(from)));
      if (Option.isSome(shownAt) && Option.isSome(movable))
        yield* Effect.flatMap(Backs, (backs) =>
          backs.back({ reference, from: movable.value, at: shownAt.value }),
        );
      const kept: Recall = { ...recall, reference, grade: cappedBy(recall.grade, taken) };
      yield* Effect.flatMap(Recalls, (recalls) => recalls.keep(kept));
      const after = yield* gardenView;
      if (after._tag === 'Unread') return 'Unread' satisfies RecallAnswer;
      const landed = Option.exists(plantIn(after, reference), (plant) =>
        plant.recalls.some(
          (each) => each.startedAt === kept.startedAt && each.grade === kept.grade,
        ),
      );
      if (landed) return 'Kept' satisfies RecallAnswer;
      return 'Failed' satisfies RecallAnswer;
    }),
  );

/** Moves `reference` back a stage from the stage it stands at, at the call's instant. */
export const moveBack = (storage: FileStorage, reference: string) =>
  withGrounds(
    storage,
    Effect.gen(function* () {
      const plant = plantIn(yield* gardenView, reference);
      if (Option.isNone(plant)) return 'Failed' satisfies BackAnswer;
      return yield* Effect.flatMap(Backs, (backs) =>
        backs.back({ reference, from: stageOf(plant.value) }),
      );
    }),
  );
