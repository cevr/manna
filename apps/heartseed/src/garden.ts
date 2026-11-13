/**
 * The garden: every verse the reader has said is a plant (Mark 4:28: seed,
 * then blade, then ear, then full corn), made from the recalls kept for it.
 *
 * Each recall is one record of the app's store, under
 * `heartseed/recall/<reference>/<startedAt>`, whose value is the recall's
 * nine fields as JSON and nothing else: a record kept before recalls
 * carried the zone's `offset` holds the other eight, and reads as a recall
 * all the same; one whose `offset` is no whole number of minutes within 18
 * hours of UTC is no recall. A recall kept again for the same
 * recital writes the same key, so the last keep wins, and a restart reads
 * the same plants back; a key's day stamp never changes once stored (its
 * `offset`, or none), so a new recital whose start reuses a stored key
 * keeps that key's stamp, and no keep can move a counted day, unless the
 * read of that stamp fails (below). A plant's FSRS card is the fold of its recalls in
 * time order, and its stage is read from its recalls and the cards they fold
 * to each time, as is the cue it is said under next (full text, then first
 * letters, then nothing): nothing but the recalls, and the reader's steps
 * back, is stored.
 *
 * A step back (`Backs`) is one record under
 * `heartseed/back/<reference>/<at>`, its value `{ reference, at }` as JSON.
 * It folds in among the recalls at its instant: a verse past a seed moves
 * one stage down (ear to blade, blade to seed, full corn to ear) and its
 * card takes an Again there, so it comes due within minutes, said under the
 * cue of its new stage; a seed has no step back.
 *
 * The garden claims a history only from a read of the store that completed:
 * at start it lists the store's keys and reads every recall key, and any
 * call that fails (the open, the listing or one record's read) fails that
 * attempt whole. It tries three times in all, a few milliseconds apart; past
 * that the garden is unread for the session, and nothing lists the store
 * again until the next launch: a keep then reads only its own key, for the
 * stamp it holds, and a keep whose read fails writes as a first write, under
 * the press's offset, so its recital is still kept. A record that reads but is no recall of its
 * own key, or a listed key with no value, is skipped and logged.
 *
 * A keep runs alone, in the order keeps are called. It writes the record
 * first; only once the write lands does the view change, and then a recital
 * that grows its verse sounds the chime, once in the launch, at its first
 * keep that grows it. Planting never sounds. An unread garden still writes
 * each keep, but its view stays unread and it never sounds. `settled` reads
 * the view behind every keep called before it, so a recital cued from it is
 * cued from the history those keeps leave.
 */

import {
  Array as Arr,
  Clock,
  Context,
  Effect,
  Layer,
  MutableRef,
  Option,
  Order,
  pipe,
  PubSub,
  Schedule,
  Schema,
  Stream,
} from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import * as Semaphore from 'effect/Semaphore';

import { NEW_CARD, review, type Card } from './fsrs';
import type { Cue } from './matcher';
import { Recalls, type Recall } from './sayit';

export const STAGES = ['seed', 'blade', 'ear', 'full corn'] as const;

export type Stage = (typeof STAGES)[number];

/** A verse's kept recalls in time order, one per recital, its steps back (each a time, in order, once), and the FSRS card they fold to. */
export interface Plant {
  readonly reference: string;
  readonly recalls: Arr.NonEmptyReadonlyArray<Recall>;
  readonly backs: readonly number[];
  readonly card: Card;
}

/** A recital that grew its verse: the stage before it and the stage it reached. */
export interface Growth {
  readonly reference: string;
  readonly startedAt: number;
  readonly from: Stage;
  readonly to: Stage;
}

/** The garden once a read of the store completed: each planted verse's plant, by its reference, empty when none is planted. */
export interface ReadGarden {
  readonly _tag: 'Read';
  readonly plants: ReadonlyMap<string, Plant>;
}

/**
 * What the garden knows: `Read` once a read of the store completed, or
 * `Unread` when every attempt failed. Unread, the reader's history is
 * unknown, so no stage, no growth and no chime can be claimed from it; an
 * empty garden is `Read` with no plants, never `Unread`.
 */
export type GardenView = ReadGarden | { readonly _tag: 'Unread' };

const UNREAD: GardenView = { _tag: 'Unread' };

/** The stability, in days, from which a verse is full corn. */
const FULL_CORN_DAYS = 21;

const RECALL_PREFIX = 'heartseed/recall/';

/** The store key of a recital's record. */
const recallKey = (recall: Pick<Recall, 'reference' | 'startedAt'>) =>
  `${RECALL_PREFIX}${recall.reference}/${recall.startedAt}`;

const BACK_PREFIX = 'heartseed/back/';

/** A step back the reader took: the verse and the instant, in epoch milliseconds. */
interface Back {
  readonly reference: string;
  readonly at: number;
}

/** The store key of a step back's record. */
const backKey = (back: Back) => `${BACK_PREFIX}${back.reference}/${back.at}`;

/**
 * The cue a verse at `stage` is said under next: first letters at a seed,
 * nothing past it. A verse not yet planted is said under the full text
 * (`cueIn`).
 */
export const cueAt = (stage: Stage): Cue => {
  if (stage === 'seed') return 'initials';
  return 'none';
};

/** The stage after one more recall, given the stage before it (none for the first) and the card's stability after it. */
const nextStage = (before: Option.Option<Stage>, recall: Recall, stability: number): Stage => {
  if (stability >= FULL_CORN_DAYS) return 'full corn';
  if (Option.isNone(before) || recall.grade === 1) return 'seed';
  if (recall.peeked > 0 || cueAt(before.value) !== 'none') return 'blade';
  return 'ear';
};

/** The stage a step back moves a verse at `stage` to, one below it: none for a seed, which has no stage below. */
export const backOf = (stage: Stage): Option.Option<Stage> =>
  Option.fromUndefinedOr(STAGES[STAGES.indexOf(stage) - 1]);

/** What a plant's history has folded to so far: its card, and its stage (none before its first recall). */
interface Folded {
  readonly card: Card;
  readonly stage: Option.Option<Stage>;
}

/** One entry of a plant's history: a recall, or a step back at its time. */
type Entry =
  | { readonly _tag: 'Recall'; readonly at: number; readonly recall: Recall }
  | { readonly _tag: 'Back'; readonly at: number };

/** Where each kind of entry falls among entries of the same instant: a recall first. */
const SAME_INSTANT: Readonly<Record<Entry['_tag'], number>> = { Recall: 0, Back: 1 };

/** Entries in time order, a recall before a step back at the same instant. */
const byTime = Order.combine(
  Order.mapInput(Order.Number, (entry: Entry) => entry.at),
  Order.mapInput(Order.Number, (entry: Entry) => SAME_INSTANT[entry._tag]),
);

/**
 * The fold of one entry: a recall reviews the card under its grade and
 * takes the stage the rule gives; a step back of a verse past a seed moves
 * its stage one down and reviews its card as Again at its time, so it comes
 * due within minutes and its stability falls; a step back of a seed, or
 * before the first recall, changes nothing.
 */
const foldEntry = (now: Folded, entry: Entry): Folded => {
  if (entry._tag === 'Recall') {
    const card = review(now.card, entry.recall.grade, entry.recall.startedAt);
    return { card, stage: Option.some(nextStage(now.stage, entry.recall, card.stability)) };
  }
  return Option.match(Option.flatMap(now.stage, backOf), {
    onNone: () => now,
    onSome: (stage) => ({ card: review(now.card, 1, entry.at), stage: Option.some(stage) }),
  });
};

/** Recalls and steps back merged in time order. */
const entriesOf = (recalls: readonly Recall[], backs: readonly number[]) =>
  Arr.sort(
    [
      ...recalls.map((recall): Entry => ({ _tag: 'Recall', at: recall.startedAt, recall })),
      ...backs.map((at): Entry => ({ _tag: 'Back', at })),
    ],
    byTime,
  );

const UNFOLDED: Folded = { card: NEW_CARD, stage: Option.none() };

/** The fold of recalls and steps back, in time order, from a new card with no stage. */
const foldOf = (recalls: readonly Recall[], backs: readonly number[]): Folded =>
  entriesOf(recalls, backs).reduce(foldEntry, UNFOLDED);

/** A verse's plant from its recalls (one per `startedAt`, the last given wins) and its steps back (`backs`, each instant once), in time order, and the card folded over them from a new card. */
export const plantOf = (
  recalls: Arr.NonEmptyReadonlyArray<Recall>,
  backs: readonly number[] = [],
): Plant => {
  const ordered = pipe(
    recalls,
    Arr.reverse,
    Arr.dedupeWith((a, b) => a.startedAt === b.startedAt),
    Arr.sortWith((recall) => recall.startedAt, Order.Number),
  );
  const steps = Arr.sort(Arr.dedupe(backs), Order.Number);
  return {
    reference: Arr.headNonEmpty(recalls).reference,
    recalls: ordered,
    backs: steps,
    card: foldOf(ordered, steps).card,
  };
};

/**
 * A plant's stage, the rule applied after each of its recalls in time order:
 * full corn once the card's stability reaches 21 days; else a seed at the
 * first recall or one graded Again; else a blade when the recall was helped,
 * by a peek or by the cue the stage before it gave (first letters at a
 * seed); else an ear (recalled with nothing, a miss with no peek included).
 * A recall's help is derived from the entries before it, never stored. A
 * step back between them moves the stage one down (`foldEntry`). A last
 * step that is a recall reads the plant's own card.
 */
export const stageOf = (plant: Plant): Stage => {
  const entries = entriesOf(plant.recalls, plant.backs);
  const before = entries.slice(0, -1).reduce(foldEntry, UNFOLDED);
  const last = Option.match(Arr.last(entries), {
    onNone: () => before.stage,
    onSome: (entry) => {
      if (entry._tag === 'Back') return foldEntry(before, entry).stage;
      return Option.some(nextStage(before.stage, entry.recall, plant.card.stability));
    },
  });
  return Option.getOrElse(last, (): Stage => 'seed');
};

/**
 * The plant as it stood before its recall number `count` + 1: its first
 * `count` recalls and the steps back before the next one (all of them when
 * none follows); none for no recall.
 */
export const plantBefore = (plant: Plant, count: number): Option.Option<Plant> => {
  const first = plant.recalls.slice(0, count);
  if (!Arr.isReadonlyArrayNonEmpty(first)) return Option.none();
  return Option.some(
    plantOf(
      first,
      Option.match(Option.fromUndefinedOr(plant.recalls[count]), {
        onNone: () => plant.backs,
        onSome: (after) => plant.backs.filter((at) => at < after.startedAt),
      }),
    ),
  );
};

/**
 * The cue the piece at `reference` is said under next in a read garden: its
 * own plant's stage's cue once planted, else the full text, whatever plants
 * of pieces of it an earlier build kept.
 */
export const cueIn = (garden: ReadGarden, reference: string): Cue =>
  Option.match(Option.fromNullishOr(garden.plants.get(reference)), {
    onNone: (): Cue => 'full',
    onSome: (plant) => cueAt(stageOf(plant)),
  });

const rankOf = (stage: Stage) => STAGES.indexOf(stage);

/** The stage of a plant's recalls that pass `keep`, with its steps back before `startedAt`; none when no recall passes. */
const stageAmong = (plant: Plant, keep: (recall: Recall) => boolean, startedAt: number) => {
  const kept = plant.recalls.filter(keep);
  if (!Arr.isReadonlyArrayNonEmpty(kept)) return Option.none<Stage>();
  return Option.some(
    stageOf(
      plantOf(
        kept,
        plant.backs.filter((at) => at < startedAt),
      ),
    ),
  );
};

/**
 * How the recital at `startedAt` grew its plant: the stage over the recalls
 * before it, and the stage over those up to it, each with the steps back
 * before it. Some only when the plant holds that recital and recalls before
 * it (planting is not growth), and the new stage ranks above the one before.
 */
export const growthOf = (
  plant: Plant,
  startedAt: number,
): Option.Option<{ readonly from: Stage; readonly to: Stage }> => {
  if (!plant.recalls.some((recall) => recall.startedAt === startedAt)) return Option.none();
  return Option.filter(
    Option.all({
      from: stageAmong(plant, (recall) => recall.startedAt < startedAt, startedAt),
      to: stageAmong(plant, (recall) => recall.startedAt <= startedAt, startedAt),
    }),
    ({ from, to }) => rankOf(to) > rankOf(from),
  );
};

/** The growth sound: one short sound, played when a recital grows its verse. */
export class Chime extends Context.Service<
  Chime,
  { readonly grow: (growth: Growth) => Effect.Effect<void> }
>()('heartseed/garden/Chime') {}

/** What the garden knows now, and each change of it (a new subscriber starts at the current view). */
export class Garden extends Context.Service<
  Garden,
  {
    readonly view: Effect.Effect<GardenView>;
    /** The view once every keep handed to the garden before it has landed or failed: what a recital about to start is said after. */
    readonly settled: Effect.Effect<GardenView>;
    readonly changes: Stream.Stream<GardenView>;
  }
>()('heartseed/garden/Garden') {}

/** A step back's answer: `Moved` once its record is written and the view shows the verse a stage lower, else `Failed` (the write failed, the garden is unread, or the verse is no plant past a seed). */
export type BackAnswer = 'Moved' | 'Failed';

/** Moving a verse back a stage: `back(reference)` keeps a step back of the verse at the clock's instant, after every keep handed to the garden before it. */
export class Backs extends Context.Service<
  Backs,
  { readonly back: (reference: string) => Effect.Effect<BackAnswer> }
>()('heartseed/garden/Backs') {}

const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

/** The most a stored offset may lie from UTC, in minutes either way: 18 hours. */
const OFFSET_BOUND = 1080;

const Offset = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(-OFFSET_BOUND),
  Schema.isLessThanOrEqualTo(OFFSET_BOUND),
);

/** A recall's record: its nine fields as JSON, `offset` absent from a record kept before recalls carried it. */
const RecallRecord = Schema.fromJsonString(
  Schema.Struct({
    reference: Schema.String,
    startedAt: Count,
    offset: Schema.optionalKey(Offset),
    grade: Schema.Literals([1, 2, 3, 4]),
    suggested: Schema.Literals([1, 2, 3]),
    words: Count,
    missed: Count,
    peeked: Count,
    extra: Count,
  }),
);

/** A step back's record: its verse and instant as JSON. */
const BackRecord = Schema.fromJsonString(Schema.Struct({ reference: Schema.String, at: Count }));

const RECALL_FIELDS: readonly (keyof Recall)[] = [
  'reference',
  'startedAt',
  'offset',
  'grade',
  'suggested',
  'words',
  'missed',
  'peeked',
  'extra',
];

const sameRecall = (a: Recall, b: Recall) => RECALL_FIELDS.every((field) => a[field] === b[field]);

/** The views a held subscriber of `changes` keeps: past it, its oldest view slides out, so it always reaches the latest. */
const WINDOW = 16;

/** The view with `recall` kept in its verse's plant, replacing the one of the same recital. */
const withRecall = (view: ReadGarden, recall: Recall): ReadGarden => {
  const plants = new Map(view.plants);
  const recalls = Option.match(Option.fromNullishOr(plants.get(recall.reference)), {
    onNone: (): Arr.NonEmptyReadonlyArray<Recall> => [recall],
    onSome: (plant) => Arr.append(plant.recalls, recall),
  });
  const backs = Option.match(Option.fromNullishOr(plants.get(recall.reference)), {
    onNone: (): readonly number[] => [],
    onSome: (plant) => plant.backs,
  });
  plants.set(recall.reference, plantOf(recalls, backs));
  return { _tag: 'Read', plants };
};

/** The view with a step back of `back.reference` at `back.at` in its plant; unchanged when the verse has no plant. */
const withBack = (view: ReadGarden, back: Back): ReadGarden =>
  Option.match(Option.fromNullishOr(view.plants.get(back.reference)), {
    onNone: () => view,
    onSome: (plant) => {
      const plants = new Map(view.plants);
      plants.set(back.reference, plantOf(plant.recalls, [...plant.backs, back.at]));
      return { _tag: 'Read', plants };
    },
  });

/** The recall kept for a recital, none when its plant holds none. */
const keptFor = (view: ReadGarden, recall: Recall) =>
  Option.flatMap(Option.fromNullishOr(view.plants.get(recall.reference)), (plant) =>
    Arr.findFirst(plant.recalls, (kept) => kept.startedAt === recall.startedAt),
  );

/**
 * `recall` with the day stamp of `stored`, the recall its key already
 * holds: that recall's offset, or none when it was kept before recalls
 * carried one. A key's day never changes once stored, so a new recital that
 * reuses an earlier start (the clock set back, the zone changed) cannot move
 * a day the field has counted; only a key written for the first time takes
 * the press's offset.
 */
const stampedLike = (recall: Recall, stored: Option.Option<Recall>): Recall =>
  Option.match(stored, {
    onNone: () => recall,
    onSome: (kept) => {
      if (kept.offset === recall.offset) return recall;
      const { offset: _, ...rest } = recall;
      return Option.match(Option.fromNullishOr(kept.offset), {
        onNone: (): Recall => rest,
        onSome: (offset): Recall => ({ ...rest, offset }),
      });
    },
  });

/** How many attempts in all the garden makes to read the store at start. */
const READ_ATTEMPTS = 3;

/** The waits between attempts: 10 ms, then 20 ms. */
const READ_WAITS = Schedule.exponential('10 millis');

/** A stored value decoded: the recall it holds when it is a valid recall of its own key, else none. */
const recallIn = (key: string, value: Option.Option<string>) =>
  Option.match(value, {
    onNone: () => Effect.succeed(Option.none<Recall>()),
    onSome: (text) =>
      Schema.decodeEffect(RecallRecord)(text).pipe(
        Effect.map((recall) =>
          Option.filter(Option.some<Recall>(recall), (each) => recallKey(each) === key),
        ),
        Effect.orElseSucceed(() => Option.none<Recall>()),
      ),
  });

/** A stored value decoded as `recallIn` does, logged as skipped when it holds no recall. */
const recordAt = (key: string, value: Option.Option<string>) =>
  recallIn(key, value).pipe(
    Effect.tap((recall) =>
      Effect.when(
        Effect.logWarning('garden.record.skipped').pipe(Effect.annotateLogs({ key })),
        Effect.sync(() => Option.isNone(recall)),
      ),
    ),
  );

/** A stored value decoded: the step back it holds when it is a valid step back of its own key, else none, logged as skipped. */
const backAt = (key: string, value: Option.Option<string>) =>
  Option.match(value, {
    onNone: () => Effect.succeed(Option.none<Back>()),
    onSome: (text) =>
      Schema.decodeEffect(BackRecord)(text).pipe(
        Effect.map((back) =>
          Option.filter(Option.some<Back>(back), (each) => backKey(each) === key),
        ),
        Effect.orElseSucceed(() => Option.none<Back>()),
      ),
  }).pipe(
    Effect.tap((back) =>
      Effect.when(
        Effect.logWarning('garden.record.skipped').pipe(Effect.annotateLogs({ key })),
        Effect.sync(() => Option.isNone(back)),
      ),
    ),
  );

/** One attempt at the store's recalls and steps back: one listing, then the value of every recall and step back key in it. Any call that fails, the store's open included, fails the attempt whole. */
const readAttempt = (store: KeyValueStore.KeyValueStore) =>
  Effect.flatMap(store.keys, (keys) =>
    Effect.forEach(
      keys.filter((key) => key.startsWith(RECALL_PREFIX) || key.startsWith(BACK_PREFIX)),
      (key) => Effect.map(store.get(key), (value) => [key, Option.fromNullishOr(value)] as const),
    ),
  );

/**
 * The view a launch starts at: `Read` with every valid recall of the first
 * attempt that completes, then every valid step back of a planted verse, or
 * `Unread` when all three fail. Records are decoded only once an attempt has
 * completed, so a record that cannot be decoded is skipped, never retried
 * as a failed read.
 */
const readGarden = (store: KeyValueStore.KeyValueStore) =>
  readAttempt(store).pipe(
    Effect.tapError((error) =>
      Effect.logWarning('garden.read.retry').pipe(Effect.annotateLogs({ method: error.method })),
    ),
    Effect.retry({ times: READ_ATTEMPTS - 1, schedule: READ_WAITS }),
    Effect.flatMap((stored) => {
      const isBack = ([key]: readonly [string, Option.Option<string>]) =>
        key.startsWith(BACK_PREFIX);
      return Effect.all({
        recalls: Effect.forEach(
          stored.filter((each) => !isBack(each)),
          ([key, value]) => recordAt(key, value),
        ),
        backs: Effect.forEach(stored.filter(isBack), ([key, value]) => backAt(key, value)),
      });
    }),
    Effect.map(({ recalls, backs }): GardenView =>
      Arr.getSomes(backs).reduce(
        withBack,
        Arr.getSomes(recalls).reduce(withRecall, { _tag: 'Read', plants: new Map() }),
      ),
    ),
    Effect.catch(() => Effect.as(Effect.logWarning('garden.read.failed'), UNREAD)),
  );

/** The garden over the app's store, the `Recalls` Say it hands its recalls to, and the `Backs` a verse is moved back a stage by. Its build includes the read, so its view is `Read` or `Unread` from the start. */
export const layer: Layer.Layer<
  Garden | Recalls | Backs,
  never,
  KeyValueStore.KeyValueStore | Chime
> = Layer.effectContext(
  Effect.gen(function* () {
    const store = yield* KeyValueStore.KeyValueStore;
    const chime = yield* Chime;
    const held = MutableRef.make(yield* readGarden(store));
    const sounded = new Set<string>();
    const views = yield* PubSub.sliding<GardenView>({ capacity: WINDOW, replay: 1 });
    yield* PubSub.publish(views, MutableRef.get(held));
    const lock = yield* Semaphore.make(1);

    /** Sounds the chime for the recital `recall` belongs to when it grew its verse in `garden` and has not sounded in this launch. */
    const sound = Effect.fn('Garden.sound')(function* (garden: ReadGarden, recall: Recall) {
      const key = recallKey(recall);
      const plant = Option.fromNullishOr(garden.plants.get(recall.reference));
      const growth = Option.flatMap(plant, (each) => growthOf(each, recall.startedAt));
      if (sounded.has(key) || Option.isNone(growth)) return;
      sounded.add(key);
      const { from, to } = growth.value;
      yield* Effect.logInfo('garden.grew').pipe(
        Effect.annotateLogs({ reference: recall.reference, from, to }),
      );
      yield* chime.grow({ reference: recall.reference, startedAt: recall.startedAt, from, to });
    });

    /**
     * The recall a key already holds: the read view's, or for an unread
     * garden, which knows no history, the record read from the store at
     * that key (a read that can fail).
     */
    const storedAt = (view: GardenView, recall: Recall) => {
      if (view._tag === 'Read') return Effect.succeed(keptFor(view, recall));
      const key = recallKey(recall);
      return Effect.flatMap(store.get(key), (value) => recallIn(key, Option.fromNullishOr(value)));
    };

    /**
     * Keeps one recall under the day stamp its key already holds
     * (`stampedLike`): writes its record, then changes the view, then
     * sounds a growth; a failed write changes nothing. When the read of
     * that stamp fails, the keep writes as a key's first write, with the
     * press's offset: a finished recital is never dropped for a stamp it
     * could not read, and a key already stored under another stamp (a start
     * reused after the clock went back) is the one whose day can then move.
     * An unread garden
     * still writes the record, but its view stays unread and it never
     * sounds, as the history the growth is measured from is unknown.
     */
    const keep = Effect.fn('Garden.keep')(function* (given: Recall) {
      const before = MutableRef.get(held);
      const recall = yield* storedAt(before, given).pipe(
        Effect.map((stored) => stampedLike(given, stored)),
        Effect.catch(() =>
          Effect.as(
            Effect.logWarning('garden.keep.unstamped').pipe(
              Effect.annotateLogs({ reference: given.reference, startedAt: given.startedAt }),
            ),
            given,
          ),
        ),
      );
      if (
        before._tag === 'Read' &&
        Option.exists(keptFor(before, recall), (kept) => sameRecall(kept, recall))
      )
        return;
      const written = yield* Schema.encodeEffect(RecallRecord)(recall).pipe(
        Effect.flatMap((text) => store.set(recallKey(recall), text)),
        Effect.as(true),
        Effect.catch(() =>
          Effect.as(
            Effect.logWarning('garden.keep.failed').pipe(
              Effect.annotateLogs({ reference: recall.reference, startedAt: recall.startedAt }),
            ),
            false,
          ),
        ),
      );
      if (!written || before._tag === 'Unread') return;
      const after = withRecall(before, recall);
      MutableRef.set(held, after);
      yield* PubSub.publish(views, after);
      yield* sound(after, recall);
    });

    /**
     * Keeps a step back of `reference` at the clock's instant: in a read
     * garden whose plant of it stands past a seed, writes its record, then
     * changes the view. A failed write changes nothing; an unread garden,
     * a verse not planted and a seed write nothing. Each is `Failed`.
     */
    const back = Effect.fn('Garden.back')(function* (reference: string) {
      const before = MutableRef.get(held);
      if (
        before._tag === 'Unread' ||
        !Option.exists(Option.fromNullishOr(before.plants.get(reference)), (plant) =>
          Option.isSome(backOf(stageOf(plant))),
        )
      ) {
        yield* Effect.logWarning('garden.back.refused').pipe(Effect.annotateLogs({ reference }));
        return 'Failed' as const;
      }
      const step: Back = { reference, at: yield* Clock.currentTimeMillis };
      const written = yield* Schema.encodeEffect(BackRecord)(step).pipe(
        Effect.flatMap((text) => store.set(backKey(step), text)),
        Effect.as(true),
        Effect.catch(() =>
          Effect.as(
            Effect.logWarning('garden.back.failed').pipe(Effect.annotateLogs({ reference })),
            false,
          ),
        ),
      );
      if (!written) return 'Failed' as const;
      const after = withBack(before, step);
      MutableRef.set(held, after);
      yield* PubSub.publish(views, after);
      yield* Effect.logInfo('garden.back').pipe(Effect.annotateLogs({ reference }));
      return 'Moved' as const;
    });

    const view = Effect.sync(() => MutableRef.get(held));

    return Context.make(
      Garden,
      Garden.of({
        view,
        settled: Semaphore.withPermits(lock, 1)(view),
        changes: Stream.fromPubSub(views),
      }),
    ).pipe(
      Context.add(
        Recalls,
        Recalls.of({ keep: (recall) => Semaphore.withPermits(lock, 1)(keep(recall)) }),
      ),
      Context.add(
        Backs,
        Backs.of({ back: (reference) => Semaphore.withPermits(lock, 1)(back(reference)) }),
      ),
    );
  }),
);
