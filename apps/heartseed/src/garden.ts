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
 * keeps that key's stamp, and no keep can move a counted day. A plant's FSRS card is the fold of its recalls in
 * time order, and its stage is read from its recalls and the cards they fold
 * to each time, as is the cue it is said under next (full text, then first
 * letters, then nothing): nothing but the recalls is stored.
 *
 * The garden claims a history only from a read of the store that completed:
 * at start it lists the store's keys and reads every recall key, and any
 * call that fails (the open, the listing or one record's read) fails that
 * attempt whole. It tries three times in all, a few milliseconds apart; past
 * that the garden is unread for the session, and nothing lists the store
 * again until the next launch: a keep then reads only its own key, for the
 * stamp it holds, and a keep whose read fails writes nothing. A record that reads but is no recall of its
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

/** A verse's kept recalls in time order, one per recital, and the FSRS card they fold to. */
export interface Plant {
  readonly reference: string;
  readonly recalls: Arr.NonEmptyReadonlyArray<Recall>;
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

/** A verse's plant from its recalls: one per `startedAt` (the last given wins), in time order, and the card folded over them from a new card. */
export const plantOf = (recalls: Arr.NonEmptyReadonlyArray<Recall>): Plant => {
  const ordered = pipe(
    recalls,
    Arr.reverse,
    Arr.dedupeWith((a, b) => a.startedAt === b.startedAt),
    Arr.sortWith((recall) => recall.startedAt, Order.Number),
  );
  return {
    reference: Arr.headNonEmpty(recalls).reference,
    recalls: ordered,
    card: ordered.reduce((card, recall) => review(card, recall.grade, recall.startedAt), NEW_CARD),
  };
};

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

/**
 * A plant's stage, the rule applied after each of its recalls in time order:
 * full corn once the card's stability reaches 21 days; else a seed at the
 * first recall or one graded Again; else a blade when the recall was helped,
 * by a peek or by the cue the stage before it gave (first letters at a
 * seed); else an ear (recalled with nothing, a miss with no peek included).
 * A recall's help is derived from the recalls before it, never stored. The
 * last step reads the plant's own card.
 */
export const stageOf = (plant: Plant): Stage => {
  const { recalls } = plant;
  const folded = Arr.initNonEmpty(recalls).reduce(
    ({ card, stage }, recall) => {
      const after = review(card, recall.grade, recall.startedAt);
      return { card: after, stage: Option.some(nextStage(stage, recall, after.stability)) };
    },
    { card: NEW_CARD, stage: Option.none<Stage>() },
  );
  return nextStage(folded.stage, Arr.lastNonEmpty(recalls), plant.card.stability);
};

/** The cue the verse at `reference` is said under next in a read garden: the full text before it is planted, then its stage's cue. */
export const cueIn = (garden: ReadGarden, reference: string): Cue =>
  Option.match(Option.fromNullishOr(garden.plants.get(reference)), {
    onNone: (): Cue => 'full',
    onSome: (plant) => cueAt(stageOf(plant)),
  });

const rankOf = (stage: Stage) => STAGES.indexOf(stage);

/** The stage of a plant's recalls that pass `keep`, none when none do. */
const stageAmong = (plant: Plant, keep: (recall: Recall) => boolean) => {
  const kept = plant.recalls.filter(keep);
  if (!Arr.isReadonlyArrayNonEmpty(kept)) return Option.none<Stage>();
  return Option.some(stageOf(plantOf(kept)));
};

/**
 * How the recital at `startedAt` grew its plant: the stage over the recalls
 * before it, and the stage over those up to it. Some only when the plant
 * holds that recital and recalls before it (planting is not growth), and
 * the new stage ranks above the one before.
 */
export const growthOf = (
  plant: Plant,
  startedAt: number,
): Option.Option<{ readonly from: Stage; readonly to: Stage }> => {
  if (!plant.recalls.some((recall) => recall.startedAt === startedAt)) return Option.none();
  return Option.filter(
    Option.all({
      from: stageAmong(plant, (recall) => recall.startedAt < startedAt),
      to: stageAmong(plant, (recall) => recall.startedAt <= startedAt),
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
  plants.set(recall.reference, plantOf(recalls));
  return { _tag: 'Read', plants };
};

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

/** One attempt at the store's recalls: one listing, then the value of every recall key in it. Any call that fails, the store's open included, fails the attempt whole. */
const readAttempt = (store: KeyValueStore.KeyValueStore) =>
  Effect.flatMap(store.keys, (keys) =>
    Effect.forEach(
      keys.filter((key) => key.startsWith(RECALL_PREFIX)),
      (key) => Effect.map(store.get(key), (value) => [key, Option.fromNullishOr(value)] as const),
    ),
  );

/**
 * The view a launch starts at: `Read` with every valid recall of the first
 * attempt that completes, or `Unread` when all three fail. Records are
 * decoded only once an attempt has completed, so a record that cannot be
 * decoded is skipped, never retried as a failed read.
 */
const readGarden = (store: KeyValueStore.KeyValueStore) =>
  readAttempt(store).pipe(
    Effect.tapError((error) =>
      Effect.logWarning('garden.read.retry').pipe(Effect.annotateLogs({ method: error.method })),
    ),
    Effect.retry({ times: READ_ATTEMPTS - 1, schedule: READ_WAITS }),
    Effect.flatMap((stored) => Effect.forEach(stored, ([key, value]) => recordAt(key, value))),
    Effect.map((records): GardenView =>
      Arr.getSomes(records).reduce(withRecall, { _tag: 'Read', plants: new Map() }),
    ),
    Effect.catch(() => Effect.as(Effect.logWarning('garden.read.failed'), UNREAD)),
  );

/** The garden over the app's store, and the `Recalls` Say it hands its recalls to. Its build includes the read, so its view is `Read` or `Unread` from the start. */
export const layer: Layer.Layer<Garden | Recalls, never, KeyValueStore.KeyValueStore | Chime> =
  Layer.effectContext(
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
       * that key (a read that fails fails the keep).
       */
      const storedAt = (view: GardenView, recall: Recall) => {
        if (view._tag === 'Read') return Effect.succeed(keptFor(view, recall));
        const key = recallKey(recall);
        return Effect.flatMap(store.get(key), (value) =>
          recallIn(key, Option.fromNullishOr(value)),
        );
      };

      /**
       * Keeps one recall under the day stamp its key already holds
       * (`stampedLike`): writes its record, then changes the view, then
       * sounds a growth; a failed write changes nothing. An unread garden
       * still writes the record, but its view stays unread and it never
       * sounds, as the history the growth is measured from is unknown.
       */
      const keep = Effect.fn('Garden.keep')(function* (given: Recall) {
        const before = MutableRef.get(held);
        const stamped = yield* Effect.option(
          Effect.map(storedAt(before, given), (stored) => stampedLike(given, stored)),
        );
        const recall = Option.getOrElse(stamped, () => given);
        if (
          before._tag === 'Read' &&
          Option.exists(keptFor(before, recall), (kept) => sameRecall(kept, recall))
        )
          return;
        const written = yield* Effect.fromOption(stamped).pipe(
          Effect.flatMap(Schema.encodeEffect(RecallRecord)),
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
      );
    }),
  );
