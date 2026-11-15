/* oxlint-disable effect/noAsyncFunction, effect/noNewError, effect/noNullish, effect/noThrowStatement, effect/noTernary, effect/noGlobals, effect/noNewPromise -- a test model: the port's storage stand-in answers with promises as Exact's does, the oracle runs the current app's services by `Effect.runPromise` under a TestClock, and the steps are awaited one by one as Exact asks them. */

/**
 * The garden's model for its generated tests. A history is a seeded run
 * of steps (plant a range, remove a list or a single verse, recall a verse
 * with every grade and help, move a verse back, time passing by minutes to
 * days, the zone changing, a relaunch, a read). Each step runs twice: on
 * the port's sources over a stand-in for Exact's storage, each call
 * through the runner inside the data host; and on the oracle, the current
 * Heartseed's own `Garden`, `Passages` and FSRS built once per launch, as
 * the current app builds them, over `KeyValueStore.layerMemory`, under a
 * `TestClock` set to the step's instant. The single verses are the current
 * app's too: `Passages`'s `join` and `part`.
 */

import { withDataHost } from '@manna/exact-kit/data-host/testing';
import type { FileStorage } from '@manna/exact-kit/storage';
import {
  backOf,
  Backs,
  Chime,
  Garden,
  layer as gardenLayer,
  shownAllCap,
  stageOf,
  type GardenView,
  type Plant,
  type Stage,
} from '@manna/heartseed/garden';
import { listsOf } from '@manna/heartseed/lists';
import {
  layer as passagesLayer,
  Passages,
  verseReference,
  type PassagesView,
  type Range,
} from '@manna/heartseed/passages';
import { cappedBy, PEEK_CAP, Recalls, type Grade, type Recall } from '@manna/heartseed/sayit';
import { Context, Effect, Exit, Layer, Logger, Option, Scope } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import { TestClock } from 'effect/testing';

import { GARDEN_FILE, type Held } from '../garden/program';
import { gardenSources } from '../garden/sources';
import type { Random } from './random';

/** The chapters a history plants from (book, chapter, its verse count), so ranges meet and overlap. */
const CHAPTERS: ReadonlyArray<readonly [number, number, number]> = [
  [43, 3, 36],
  [19, 23, 6],
  [23, 41, 29],
  [45, 8, 39],
  [64, 1, 25],
];

/** Offsets a history's zone takes, minutes east of UTC: New York in winter and summer, UTC, Kolkata, Berlin, Tokyo, Hawaii, Chatham. */
const OFFSETS = [-300, -240, 0, 330, 60, 540, -600, 765];

const MINUTE = 60_000;
const DAY = 86_400_000;

/** One help taken before a try, as SayIt builds it: each peek caps at Hard, Show all at `shownAllCap` of the stage. */
export interface HelpTaken {
  readonly peeked: number[];
  // oxlint-disable-next-line effect/noNullish -- Contract's option and SayIt's Help give no Show all as null.
  readonly shownAt: number | null;
  readonly cap: Grade;
}

export type Step =
  | { readonly _tag: 'plant'; readonly range: Range }
  | { readonly _tag: 'remove'; readonly id: string }
  | {
      readonly _tag: 'recall';
      readonly reference: string;
      readonly recall: Omit<Recall, 'reference'>;
      readonly help: HelpTaken;
    }
  | { readonly _tag: 'back'; readonly reference: string }
  | { readonly _tag: 'pass'; readonly ms: number }
  | { readonly _tag: 'zone'; readonly offset: number }
  | { readonly _tag: 'relaunch' }
  | { readonly _tag: 'read' };

/** Where a history stands: its instant and zone, and what the oracle holds, for drawing the next step. */
export interface Now {
  readonly now: number;
  readonly offset: number;
  readonly held: Held;
}

export const rangeIn = (random: Random): Range => {
  const [book, chapter, verses] = random.pick(CHAPTERS);
  const length = random.pick([1, 1, 1, 2, 3, 3, 4, 5, 8]);
  const first = 1 + random.below(verses);
  if (random.chance(0.05)) return { book, chapter, first: 0, last: 2 };
  if (random.chance(0.05)) return { book, chapter, first, last: verses + 3 };
  return { book, chapter, first, last: Math.min(verses, first + length - 1) };
};

/** The verses a history may recall: those held, and now and then one never planted. */
const versesHeld = (held: Held): readonly string[] => {
  const lists =
    held.passages._tag === 'Read'
      ? listsOf([], held.passages, []).flatMap((list) => list.verses)
      : [];
  const singles = Option.match(held.singles, {
    onNone: () => [],
    onSome: (ranges) =>
      ranges.map((range) => verseReference(range.book, range.chapter, range.first)),
  });
  return [...lists, ...singles];
};

const plantOf = (held: Held, reference: string): Option.Option<Plant> => {
  if (held.garden._tag === 'Unread') return Option.none();
  return Option.fromUndefinedOr(held.garden.plants.get(reference));
};

/** The help SayIt would hold: peeks at rest then maybe Show all, each capping as SayIt's `reveal` and `showAll` do; `sloppy` keeps Easy as the cap, a caller that forgot it. */
const helpOf = (
  random: Random,
  now: number,
  stage: Option.Option<Stage>,
  words: number,
  sloppy: boolean,
): HelpTaken => {
  let cap: Grade = 4;
  const peeked: number[] = [];
  // oxlint-disable-next-line effect/noNullish -- SayIt's Help gives no Show all as null.
  let shownAt: number | null = null;
  if (random.chance(0.4)) {
    for (let n = 1 + random.below(3); n > 0; n--) peeked.push(random.below(words));
    cap = cappedBy(PEEK_CAP, Option.some({ reference: '', peeked, shownAt, cap }));
  }
  if (Option.isSome(stage) && random.chance(0.35)) {
    shownAt = now - 1 - random.below(30_000);
    for (let index = 0; index < words; index++) if (!peeked.includes(index)) peeked.push(index);
    cap = cappedBy(shownAllCap(stage.value), Option.some({ reference: '', peeked, shownAt, cap }));
  }
  if (sloppy) cap = 4;
  return { peeked: [...new Set(peeked)], shownAt, cap };
};

/** The steps a history opens with: now and then a garden sown with 18 to 20 distinct single verses, so the limit of 20 is met. */
export const openingOf = (random: Random): readonly Step[] => {
  if (!random.chance(0.15)) return [];
  const [book, chapter, verses] = random.pick(CHAPTERS.filter(([, , count]) => count >= 25));
  const count = 18 + random.below(3);
  const start = 1 + random.below(verses - count + 1);
  return Array.from({ length: count }, (_, index) => ({
    _tag: 'plant' as const,
    range: { book, chapter, first: start + index, last: start + index },
  }));
};

/** The next step of a history at `at`. */
export const stepOf = (random: Random, at: Now): Step => {
  const verses = versesHeld(at.held);
  const pickVerse = () =>
    verses.length > 0 && random.chance(0.9)
      ? random.pick(verses)
      : verseReference(...(([b, c]) => [b, c, 1] as const)(random.pick(CHAPTERS)));
  const roll = random.below(100);
  if (roll < 22) return { _tag: 'plant', range: rangeIn(random) };
  if (roll < 30) {
    const ids =
      at.held.passages._tag === 'Read'
        ? listsOf([], at.held.passages, []).map((list) => list.id)
        : [];
    const singles = Option.getOrElse(at.held.singles, () => []).map(
      (range) => `single:${verseReference(range.book, range.chapter, range.first)}`,
    );
    const all = [...ids, ...singles];
    return {
      _tag: 'remove',
      id: all.length > 0 && random.chance(0.9) ? random.pick(all) : 'passage:9:1.1.1-3',
    };
  }
  if (roll < 70) {
    const reference = pickVerse();
    const words = 3 + random.below(20);
    const stage = Option.map(plantOf(at.held, reference), stageOf);
    const help = random.chance(0.7)
      ? helpOf(random, at.now, stage, words, random.chance(0.15))
      : { peeked: [], shownAt: null, cap: 4 as Grade };
    const missed = random.below(words + 1);
    const peeked = Math.max(help.peeked.length, random.chance(0.2) ? random.below(words + 1) : 0);
    return {
      _tag: 'recall',
      reference,
      recall: {
        startedAt: at.now,
        offset: at.offset,
        grade: random.pick<Grade>([1, 2, 3, 4]),
        suggested: random.pick<1 | 2 | 3>([1, 2, 3]),
        words,
        missed,
        peeked: Math.min(words, peeked),
        extra: random.below(3),
      },
      help,
    };
  }
  if (roll < 76) {
    const planted = at.held.garden._tag === 'Read' ? [...at.held.garden.plants.keys()] : [];
    return {
      _tag: 'back',
      reference: planted.length > 0 && random.chance(0.85) ? random.pick(planted) : pickVerse(),
    };
  }
  if (roll < 90)
    return {
      _tag: 'pass',
      ms:
        random.pick([
          MINUTE,
          10 * MINUTE,
          3_600_000,
          6 * 3_600_000,
          DAY,
          3 * DAY,
          9 * DAY,
          30 * DAY,
        ]) + random.below(MINUTE),
    };
  if (roll < 93) return { _tag: 'zone', offset: random.pick(OFFSETS) };
  if (roll < 97) return { _tag: 'relaunch' };
  return { _tag: 'read' };
};

/** A stand-in for Exact's `storage.fs`: one file system in memory (`files`, or a new one), every call answered at once, each write counted. */
export const storageOf = (files = new Map<string, ArrayBuffer>()) => {
  const counts = { writes: 0 };
  const storage: FileStorage = {
    fs: {
      readFile: async (path) => {
        const file = files.get(path);
        if (file === undefined) throw Object.assign(new Error('no file'), { code: 'ENOENT' });
        return file;
      },
      atomicWriteFile: async (path, data) => {
        counts.writes++;
        files.set(path, Uint8Array.from(data).buffer);
      },
    },
  };
  return { files, counts, storage };
};

/** The port's file as entries, as the store wrote them. */
export const entriesIn = (
  files: ReadonlyMap<string, ArrayBuffer>,
): ReadonlyArray<readonly [string, string]> => {
  const file = files.get(GARDEN_FILE);
  if (file === undefined) return [];
  return JSON.parse(new TextDecoder().decode(file));
};

const HOST = { turn: withDataHost, wait: () => Promise.resolve() };

/** The port: its sources over a storage stand-in (`storageOf`'s, or `stand`), called as Exact calls them, inside the data host. */
export const makePort = (stand: ReturnType<typeof storageOf> = storageOf()) => {
  const { files, counts, storage } = stand;
  let sources = gardenSources({ host: HOST, quiet: true });
  const call = <A>(name: keyof typeof sources, args: readonly unknown[]): Promise<A> =>
    withDataHost(() => Reflect.apply(sources[name], undefined, [args, {}, storage])) as Promise<A>;
  return {
    files,
    counts,
    storage,
    call,
    relaunch: () => {
      sources = gardenSources({ host: HOST, quiet: true });
    },
  };
};

const silentChime = Layer.succeed(Chime, Chime.of({ grow: () => Effect.void }));

/** The current app's services over one store, as a launch builds them. */
export const appGrounds = Layer.mergeAll(
  gardenLayer.pipe(Layer.provide(silentChime)),
  passagesLayer,
);

export type AppServices = Garden | Recalls | Backs | Passages;

/** A TestClock, and no logger. */
export const QUIET_TEST_CLOCK = Layer.mergeAll(TestClock.layer(), Logger.layer([]));

/** Runs `effect` on the oracle's services, its TestClock set to the instant `now`, its logs dropped. */
const atTime = <A>(
  context: Context.Context<AppServices>,
  now: number,
  effect: Effect.Effect<A, never, AppServices>,
) =>
  Effect.runPromise(
    Effect.andThen(TestClock.setTime(now), effect).pipe(Effect.provideContext(context)),
  );

/** A single verse's id on Your verses. */
const SINGLE_ID = 'single:';

const singleId = (range: Range) =>
  `${SINGLE_ID}${verseReference(range.book, range.chapter, range.first)}`;

/** The plant of `reference` in the current app's garden now. */
const plantNow = (reference: string) =>
  Effect.map(
    Effect.flatMap(Garden, (garden) => garden.view),
    (view) => {
      if (view._tag === 'Unread') return Option.none<Plant>();
      return Option.fromUndefinedOr(view.plants.get(reference));
    },
  );

/** A plant on the current app's `Passages`, as its chooser plants: one verse joins the single verses, any other range is added as a list. */
export const appPlant = (range: Range) =>
  Effect.flatMap(Passages, (passages) => {
    if (range.first === range.last)
      return Effect.map(passages.join(range), (joined): string => {
        if (joined === 'Added') return 'Planted';
        if (joined === 'Held') return 'Already';
        return joined;
      });
    return Effect.map(passages.add(range), (added): string =>
      added === 'Added' ? 'Planted' : added,
    );
  });

/** A list's or a single verse's removal on the current app's `Passages`, by its id. */
export const appRemove = (id: string) =>
  Effect.gen(function* () {
    const passages = yield* Passages;
    const view = yield* passages.view;
    if (view._tag === 'Unread') return 'Unread';
    if (id.startsWith(SINGLE_ID)) {
      const single = view.singles.find((range) => singleId(range) === id);
      if (single === undefined) return 'Absent';
      return yield* passages.part(single);
    }
    const list = listsOf([], view, []).find((each) => each.id === id);
    if (list === undefined) return 'Absent';
    if (list.source._tag === 'Passage') return yield* passages.remove(list.source.range);
    return yield* passages.uproot(id);
  });

/**
 * A recall as the current app keeps it: the help's cap as SayIt sets it
 * (a peek at rest, `PEEK_CAP`; Show all, `shownAllCap` of the stage then),
 * Show all's step back first as Today's `Next` keeps it (`shownAllBack`:
 * none for a seed or a verse not planted), then the recall, its grade held
 * to the cap (`cappedBy`).
 */
export const appRecall = (step: Extract<Step, { readonly _tag: 'recall' }>) =>
  Effect.gen(function* () {
    const { reference, help } = step;
    const stage = Option.map(yield* plantNow(reference), stageOf);
    const taken = (cap: Grade) =>
      Option.some({ reference, peeked: help.peeked, shownAt: help.shownAt, cap });
    let cap = help.cap;
    if (help.peeked.length > 0) cap = cappedBy(PEEK_CAP, taken(cap));
    if (help.shownAt !== null && Option.isSome(stage))
      cap = cappedBy(shownAllCap(stage.value), taken(cap));
    const landing = Option.flatMap(stage, backOf);
    if (help.shownAt !== null && Option.isSome(stage) && Option.isSome(landing)) {
      const at = help.shownAt;
      yield* Effect.flatMap(Backs, (backs) => backs.back({ reference, from: stage.value, at }));
    }
    const grade = cappedBy(step.recall.grade, taken(cap));
    yield* Effect.flatMap(Recalls, (recalls) => recalls.keep({ ...step.recall, reference, grade }));
    return grade;
  });

/** A move back as Your verses asks it: from the stage the verse stands at, none for a verse not planted. */
const appBack = (reference: string) =>
  Effect.flatMap(plantNow(reference), (plant) =>
    Option.match(plant, {
      onNone: () => Effect.succeed<string>('Failed'),
      onSome: (each) =>
        Effect.flatMap(Backs, (backs) => backs.back({ reference, from: stageOf(each) })),
    }),
  );

/** One step on the current app's services: its answer, none for a step that changes nothing there. */
const appStep = (step: Step): Effect.Effect<unknown, never, AppServices> => {
  if (step._tag === 'plant') return appPlant(step.range);
  if (step._tag === 'remove') return appRemove(step.id);
  if (step._tag === 'recall') return appRecall(step);
  if (step._tag === 'back') return appBack(step.reference);
  return Effect.void;
};

/** The oracle: the current app's services over `KeyValueStore.layerMemory`, built once per launch. */
export const makeOracle = async () => {
  const store = await Effect.runPromise(
    Effect.map(Layer.build(KeyValueStore.layerMemory).pipe(Effect.scoped), (ctx) =>
      Context.get(ctx, KeyValueStore.KeyValueStore),
    ),
  );
  let scope = await Effect.runPromise(Scope.make());
  const build = () =>
    Effect.runPromise(
      Layer.buildWithScope(
        appGrounds.pipe(
          Layer.provide(Layer.succeed(KeyValueStore.KeyValueStore, store)),
          Layer.provideMerge(QUIET_TEST_CLOCK),
        ),
        scope,
      ),
    );
  let context = await build();
  const held = (now: number): Promise<Held> =>
    atTime(
      context,
      now,
      Effect.map(
        Effect.all({
          garden: Effect.flatMap(Garden, (garden) => garden.view),
          passages: Effect.flatMap(Passages, (passages) => passages.view),
        }),
        ({ garden, passages }): Held => ({
          garden,
          passages,
          singles: passages._tag === 'Read' ? Option.some(passages.singles) : Option.none(),
        }),
      ),
    );
  const run = async (step: Step, now: number): Promise<unknown> => {
    if (step._tag === 'relaunch') {
      await Effect.runPromise(Scope.close(scope, Exit.void));
      scope = await Effect.runPromise(Scope.make());
      context = await build();
      return undefined;
    }
    return atTime(context, now, appStep(step));
  };
  return { store, held, run };
};

/** A garden's plants as plain data, by reference in order, so two views compare plant for plant: recalls, steps back, card and stage. */
export const plantsOf = (garden: GardenView) => {
  if (garden._tag === 'Unread') return 'Unread' as const;
  return [...garden.plants.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([reference, plant]) => ({
      reference,
      recalls: plant.recalls,
      backs: plant.backs,
      card: plant.card,
      stage: stageOf(plant),
    }));
};

/** What a call holds as plain data. */
export const plainOf = (held: Held) => ({
  plants: plantsOf(held.garden),
  passages: held.passages as PassagesView,
  singles: Option.getOrNull(held.singles),
});
