/**
 * The daily session's state for a launch: the minutes the reader chose,
 * kept in the app's store, and the plan Today offers. The minutes are read
 * once, as the service starts, so the first frame that shows them shows the
 * value read; only a tap writes them, each tap its own choice, in tap
 * order. The plan is made in one step from the garden's view and the
 * reader's passages as they are, never waiting on a keep under way, at the
 * instant on the service's clock and the zone's offset at that instant,
 * over the pieces of that step: the app's own, then the passages' verses,
 * then the taught collections' verses (`piecesOf`).
 * It is made first when Today shows with a read garden (`begin`), then
 * again at each Minutes tap, at each return to the foreground (`wake`),
 * which makes nothing while a recital is under way, and after each add or
 * remove of a passage (`remake`); none of these makes anything before the
 * first plan. A recital whose keep lands after that step counts as done by
 * its recall. Nothing else makes the plan again in a launch, and an unread
 * garden or unread passages get no plan.
 *
 * It also holds the run's one piece of state, the item held: a press of
 * Today's Say it holds the item shown, `next` drops it, and a making of the
 * plan drops it unless a recital is under way (Dictation listening or
 * finishing, read in the making's own step), so the item recited stays
 * shown until its `Next`. The hold keeps the item's piece beside it, so a
 * making that takes the verse out of the pieces (a remove of its passage
 * while the recital is under way) leaves Today the verse it shows.
 *
 * Beside the hold it keeps a visit: a tap on a known promise (`visit`)
 * makes that promise's verses, in order, the visit Today shows ahead of
 * the plan, each a review whose baseline is its plant's recalls at the tap
 * (read behind every keep handed in before it), so a verse is done once it
 * holds more. A new visit replaces the one before and never drops the
 * hold. The visit lives as the hold lives: a making drops both unless a
 * recital is under way, and `next` keeps it. Nothing of either is stored.
 */

import {
  Array as Arr,
  Clock,
  Context,
  Deferred,
  Effect,
  Exit,
  Layer,
  MutableRef,
  Option,
  PubSub,
  Schema,
  Stream,
} from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';

import { offsetAt } from '../day';
import { Dictation } from '../dictation';
import { isActive } from '../dictation/attempt';
import { Garden, type GardenView, type ReadGarden } from '../garden';
import { collectionPieces, Passages, piecesOf, type PassagesView, type Range } from '../passages';
import type { Collection } from '../promises';
import { planOf, type Item, type Minutes, type Plan, type TextPiece } from '../session';

/** The store key of the minutes; its text is `2`, `5`, `10` or `20`. */
export const MINUTES_KEY = 'heartseed/session/minutes';

/** The minutes of a missing key, any other text or a failed read. */
const DEFAULT_MINUTES: Minutes = 5;

/** The four texts a stored choice may hold, each read as its minutes. */
const StoredMinutes = Schema.Literals(['2', '5', '10', '20']);

const MINUTES_OF = {
  '2': 2,
  '5': 5,
  '10': 10,
  '20': 20,
} as const satisfies Record<typeof StoredMinutes.Type, Minutes>;

const isStored = Schema.is(StoredMinutes);

/** The minutes chosen, the plan once one is made in this launch, the pieces it plans over, and the item held while its recital or its result shows. */
export interface SessionView {
  readonly minutes: Minutes;
  readonly plan: Option.Option<Plan>;
  readonly pieces: readonly TextPiece[];
  readonly held: Option.Option<Item>;
  /** The held item's piece as the hold took it, kept and dropped with `held`, so Today shows the verse recited even after a making took it out of `pieces` (a remove of its passage while the recital is under way). */
  readonly heldPiece: Option.Option<TextPiece>;
  /** The visit Today shows ahead of the plan, in the promise's verse order; empty when none. */
  readonly visit: readonly VisitVerse[];
}

/** One verse of a visit: a review (`fresh: false`) whose `recalls` are its plant's at the tap, and its piece, grouped by the promise's collection. */
export interface VisitVerse {
  readonly item: Item;
  readonly piece: TextPiece;
}

/** The estimate of one recital of `words` words, in seconds, as the plan estimates its items. */
const secondsOf = (words: number) => 10 + words / 2;

/** The session Today runs. */
export class Session extends Context.Service<
  Session,
  {
    /** Makes the plan when none is made in this launch and the garden and the passages are read. */
    readonly begin: Effect.Effect<void>;
    /** A Minutes tap: the view takes the choice at once, a made plan is made again, and the choice is written. */
    readonly choose: (minutes: Minutes) => Effect.Effect<void>;
    /** A press of Say it on `item`, the item Today shows: it stays shown until `next`, or a making with no recital under way. */
    readonly hold: (item: Item) => Effect.Effect<void>;
    /** A tap on Next: the held item is let go, and Today shows the visit's first item not done, else the plan's. */
    readonly next: Effect.Effect<void>;
    /** A tap on `promise`, a known promise of `collection`: its verses become the visit, replacing any before and keeping the hold; nothing before the first plan or with the garden unread. */
    readonly visit: (
      collection: Pick<Collection, 'id' | 'title'>,
      promise: Range,
    ) => Effect.Effect<void>;
    /** A return to the foreground: a plan made in this launch is made again and the hold dropped, unless a recital is under way or the garden or the passages are unread. */
    readonly wake: Effect.Effect<void>;
    /** An add or a remove of a passage landed: a plan made in this launch is made again over the passages now, unless the garden or the passages are unread, and the hold dropped unless a recital is under way. */
    readonly remake: Effect.Effect<void>;
    readonly view: Effect.Effect<SessionView>;
    readonly changes: Stream.Stream<SessionView>;
  }
>()('heartseed/session/Session') {}

/** The views a held subscriber of `changes` keeps: past it, its oldest view slides out, so it always reaches the latest. */
const WINDOW = 16;

/** The stored choice: one of the four texts, else the default; a failed read is logged and reads as the default. */
const readMinutes = (store: KeyValueStore.KeyValueStore) =>
  store.get(MINUTES_KEY).pipe(
    Effect.map((raw): Minutes => {
      if (isStored(raw)) return MINUTES_OF[raw];
      return DEFAULT_MINUTES;
    }),
    Effect.catchTag('KeyValueStoreError', (error) =>
      Effect.logWarning('session.store.failed').pipe(
        Effect.annotateLogs({ method: 'get', key: MINUTES_KEY, cause: error.message }),
        Effect.as(DEFAULT_MINUTES),
      ),
    ),
  );

/** Writes the choice; a failed write is logged, and the view keeps the choice for the launch. */
const writeMinutes = (store: KeyValueStore.KeyValueStore, minutes: Minutes) =>
  store
    .set(MINUTES_KEY, String(minutes))
    .pipe(
      Effect.catchTag('KeyValueStoreError', (error) =>
        Effect.logWarning('session.store.failed').pipe(
          Effect.annotateLogs({ method: 'set', key: MINUTES_KEY, cause: error.message }),
        ),
      ),
    );

/** What a making plans from: the garden read, and the pieces over the passages read. */
interface Ground {
  readonly garden: ReadGarden;
  readonly pieces: readonly TextPiece[];
}

/** The session over the app's own pieces, in the app's order, then the reader's passages, then the verses of `collections`, the ones it teaches (none when left out), made pieces once as the layer builds. */
export const layer = (
  own: readonly TextPiece[],
  collections: readonly Collection[] = [],
): Layer.Layer<Session, never, KeyValueStore.KeyValueStore | Garden | Dictation | Passages> =>
  Layer.effect(
    Session,
    Effect.gen(function* () {
      const taught = collectionPieces(collections);
      const store = yield* KeyValueStore.KeyValueStore;
      const garden = yield* Garden;
      const dictation = yield* Dictation;
      const passages = yield* Passages;
      const held = MutableRef.make<SessionView>({
        minutes: yield* readMinutes(store),
        plan: Option.none(),
        pieces: piecesOf(own, yield* passages.view, taught),
        held: Option.none(),
        heldPiece: Option.none(),
        visit: [],
      });
      const views = yield* PubSub.sliding<SessionView>({ capacity: WINDOW, replay: 1 });
      /** The service's own clock, whoever runs the command. */
      const clock = Context.get(yield* Effect.context<never>(), Clock.Clock);

      /** Hands subscribers the view held now, so the last one handed is the latest, however commands interleave. */
      const publish = Effect.suspend(() => PubSub.publish(views, MutableRef.get(held)));
      yield* publish;

      /** The turn of the last write handed in; a write starts once the one before it ends. */
      const lastWrite = MutableRef.make(Deferred.makeUnsafe<void>());
      Deferred.doneUnsafe(MutableRef.get(lastWrite), Exit.void);

      /** Hands in a write, in the order of the call: the turn it waits on and the turn it ends. */
      const turnUnsafe = () => {
        const before = MutableRef.get(lastWrite);
        const mine = Deferred.makeUnsafe<void>();
        MutableRef.set(lastWrite, mine);
        return { before, mine };
      };

      type Turn = ReturnType<typeof turnUnsafe>;

      /** Writes a tap's own choice in its turn, so the store ends at the last tap whose write landed. */
      const persist = (turn: Turn, minutes: Minutes) =>
        Effect.andThen(Deferred.await(turn.before), writeMinutes(store, minutes));

      /** Ends a turn once the one before it ended, however the write went, so the next write never overtakes. */
      const release = (turn: Turn) =>
        Effect.andThen(Deferred.await(turn.before), Deferred.done(turn.mine, Exit.void));

      /** The garden's view, Dictation's and the passages', taken together for one making. */
      const seenNow = Effect.all({
        seen: garden.view,
        recital: dictation.view,
        chosen: passages.view,
      });

      /** What a making plans from in the step that took `seen` and `chosen`, or none when the garden or the passages are unread. */
      const groundOf = (seen: GardenView, chosen: PassagesView): Option.Option<Ground> => {
        if (seen._tag === 'Unread' || chosen._tag === 'Unread') return Option.none();
        return Option.some({ garden: seen, pieces: piecesOf(own, chosen, taught) });
      };

      /** The view after a making over `ground` for `minutes`, at the clock's instant and the zone's offset there: its plan, the pieces it planned over, and the item held and the visit kept only when `keeps`. */
      const madeUnsafe = (ground: Ground, minutes: Minutes, keeps: boolean): SessionView => {
        const now = MutableRef.get(held);
        const at = clock.currentTimeMillisUnsafe();
        return {
          ...now,
          minutes,
          pieces: ground.pieces,
          plan: Option.some(
            planOf({
              garden: ground.garden,
              pieces: ground.pieces,
              at,
              offset: offsetAt(at),
              minutes,
            }),
          ),
          held: Option.filter(now.held, () => keeps),
          heldPiece: Option.filter(now.heldPiece, () => keeps),
          visit: Arr.filter(now.visit, () => keeps),
        };
      };

      /** A plan made in this launch made again from `seen` and `chosen`, the hold kept only when `keeps`; nothing before the first plan or when either is unread. */
      const againUnsafe = (seen: GardenView, chosen: PassagesView, keeps: boolean) => {
        const ground = groundOf(seen, chosen);
        if (Option.isNone(MutableRef.get(held).plan) || Option.isNone(ground)) return Effect.void;
        MutableRef.set(held, madeUnsafe(ground.value, MutableRef.get(held).minutes, keeps));
        return publish;
      };

      return Session.of({
        begin: Effect.flatMap(seenNow, ({ seen, recital, chosen }) =>
          Effect.suspend(() => {
            const ground = groundOf(seen, chosen);
            if (Option.isSome(MutableRef.get(held).plan) || Option.isNone(ground))
              return Effect.void;
            MutableRef.set(
              held,
              madeUnsafe(ground.value, MutableRef.get(held).minutes, isActive(recital)),
            );
            return publish;
          }),
        ),
        choose: (minutes: Minutes) =>
          Effect.uninterruptibleMask((restore) =>
            Effect.flatMap(seenNow, ({ seen, recital, chosen }) =>
              Effect.flatMap(
                Effect.sync(() => {
                  const turn = turnUnsafe();
                  const ground = groundOf(seen, chosen);
                  const now = MutableRef.get(held);
                  if (Option.isSome(now.plan) && Option.isSome(ground))
                    MutableRef.set(held, madeUnsafe(ground.value, minutes, isActive(recital)));
                  else MutableRef.set(held, { ...now, minutes });
                  return turn;
                }),
                (turn) =>
                  Effect.ensuring(
                    restore(Effect.andThen(publish, persist(turn, minutes))),
                    release(turn),
                  ),
              ),
            ),
          ).pipe(Effect.withSpan('Session.choose')),
        hold: (item: Item) =>
          Effect.suspend(() => {
            MutableRef.update(held, (now) => ({
              ...now,
              held: Option.some(item),
              heldPiece: Option.orElse(
                Option.filter(now.heldPiece, (piece) => piece.reference === item.reference),
                () =>
                  Option.orElse(
                    Option.map(
                      Arr.findFirst(now.visit, (each) => each.piece.reference === item.reference),
                      (each) => each.piece,
                    ),
                    () => Arr.findFirst(now.pieces, (piece) => piece.reference === item.reference),
                  ),
              ),
            }));
            return publish;
          }),
        visit: (collection, promise) =>
          Effect.flatMap(garden.settled, (seen) =>
            Effect.suspend(() => {
              if (seen._tag === 'Unread' || Option.isNone(MutableRef.get(held).plan))
                return Effect.void;
              const pieces = collectionPieces([{ ...collection, promises: [promise] }]);
              const visit = pieces.map((piece): VisitVerse => ({
                item: {
                  reference: piece.reference,
                  fresh: false,
                  recalls: Option.match(Option.fromUndefinedOr(seen.plants.get(piece.reference)), {
                    onNone: () => 0,
                    onSome: (plant) => plant.recalls.length,
                  }),
                  seconds: secondsOf(piece.words),
                },
                piece,
              }));
              MutableRef.update(held, (now) => ({ ...now, visit }));
              return publish;
            }),
          ).pipe(Effect.withSpan('Session.visit')),
        next: Effect.suspend(() => {
          MutableRef.update(held, (now) => ({
            ...now,
            held: Option.none(),
            heldPiece: Option.none(),
          }));
          return publish;
        }),
        wake: Effect.flatMap(seenNow, ({ seen, recital, chosen }) =>
          Effect.suspend(() => {
            if (isActive(recital)) return Effect.void;
            return againUnsafe(seen, chosen, false);
          }),
        ).pipe(Effect.withSpan('Session.wake')),
        remake: Effect.flatMap(seenNow, ({ seen, recital, chosen }) =>
          Effect.suspend(() => againUnsafe(seen, chosen, isActive(recital))),
        ).pipe(Effect.withSpan('Session.remake')),
        view: Effect.sync(() => MutableRef.get(held)),
        changes: Stream.fromPubSub(views),
      });
    }),
  );
