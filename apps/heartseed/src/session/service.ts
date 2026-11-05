/**
 * The daily session's state for a launch: the minutes the reader chose,
 * kept in the app's store, and the plan Today offers. The minutes are read
 * once, as the service starts, so the first frame that shows them shows the
 * value read; only a tap writes them, each tap its own choice, in tap
 * order. The plan is made in one step from the garden's view as it is,
 * never waiting on a keep under way, at the instant on the service's clock
 * and the zone's offset at that instant: first when Today shows with a read
 * garden (`begin`), then again at each Minutes tap. A recital whose keep
 * lands after that step counts as done by its recall. Nothing else makes
 * the plan again in a launch, and an unread garden gets no plan.
 *
 * It also holds the run's one piece of state, the item held: a press of
 * Today's Say it holds the item shown, `next` drops it, and a making of the
 * plan drops it unless a recital is under way (Dictation listening or
 * finishing, read in the making's own step), so the item recited stays
 * shown until its `Next`. Nothing of it is stored.
 */

import {
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
}

/** The session Today runs. */
export class Session extends Context.Service<
  Session,
  {
    /** Makes the plan when none is made in this launch and the garden is read. */
    readonly begin: Effect.Effect<void>;
    /** A Minutes tap: the view takes the choice at once, a made plan is made again, and the choice is written. */
    readonly choose: (minutes: Minutes) => Effect.Effect<void>;
    /** A press of Say it on `item`, the item Today shows: it stays shown until `next`, or a making with no recital under way. */
    readonly hold: (item: Item) => Effect.Effect<void>;
    /** A tap on Next: the held item is let go, and Today shows the plan's first item not done. */
    readonly next: Effect.Effect<void>;
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

/** The session over the verses the app holds text for, in the app's order. */
export const layer = (
  pieces: readonly TextPiece[],
): Layer.Layer<Session, never, KeyValueStore.KeyValueStore | Garden | Dictation> =>
  Layer.effect(
    Session,
    Effect.gen(function* () {
      const store = yield* KeyValueStore.KeyValueStore;
      const garden = yield* Garden;
      const dictation = yield* Dictation;
      const held = MutableRef.make<SessionView>({
        minutes: yield* readMinutes(store),
        plan: Option.none(),
        pieces,
        held: Option.none(),
      });
      const views = yield* PubSub.sliding<SessionView>({ capacity: WINDOW, replay: 1 });
      /** The service's own clock, whoever runs the command. */
      const clock = Context.get(yield* Effect.context<never>(), Clock.Clock);

      /** Hands subscribers the view held now, so the last one handed is the latest, however commands interleave. */
      const publish = Effect.suspend(() => PubSub.publish(views, MutableRef.get(held)));
      yield* publish;

      /** The plan from `seen`, the garden's view taken in the same step, at the clock's instant and the zone's offset there. */
      const planUnsafe = (seen: ReadGarden, minutes: Minutes) => {
        const at = clock.currentTimeMillisUnsafe();
        return planOf({ garden: seen, pieces, at, offset: offsetAt(at), minutes });
      };

      /** A made plan made again from `seen` for `minutes`; no plan stays none, and an unread garden keeps what it had. */
      const remadeUnsafe = (seen: GardenView, minutes: Minutes) =>
        Option.map(MutableRef.get(held).plan, (plan) => {
          if (seen._tag === 'Unread') return plan;
          return planUnsafe(seen, minutes);
        });

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

      /** The garden's view and Dictation's, taken together for one making. */
      const seenNow = Effect.all({ seen: garden.view, recital: dictation.view });

      /** The item a step leaves held: the one held when `keeps` (a recital under way at a making, or no making), else none. */
      const keptUnsafe = (keeps: boolean) => {
        if (keeps) return MutableRef.get(held).held;
        return Option.none<Item>();
      };

      return Session.of({
        begin: Effect.flatMap(seenNow, ({ seen, recital }) =>
          Effect.suspend(() => {
            const now = MutableRef.get(held);
            if (Option.isSome(now.plan) || seen._tag === 'Unread') return Effect.void;
            MutableRef.set(held, {
              ...now,
              plan: Option.some(planUnsafe(seen, now.minutes)),
              held: keptUnsafe(isActive(recital)),
            });
            return publish;
          }),
        ),
        choose: (minutes: Minutes) =>
          Effect.uninterruptibleMask((restore) =>
            Effect.flatMap(seenNow, ({ seen, recital }) =>
              Effect.flatMap(
                Effect.sync(() => {
                  const turn = turnUnsafe();
                  const plan = remadeUnsafe(seen, minutes);
                  const made = Option.isSome(plan) && seen._tag === 'Read';
                  const now = MutableRef.get(held);
                  MutableRef.set(held, {
                    ...now,
                    minutes,
                    plan,
                    held: keptUnsafe(isActive(recital) || !made),
                  });
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
            MutableRef.update(held, (now) => ({ ...now, held: Option.some(item) }));
            return publish;
          }),
        next: Effect.suspend(() => {
          MutableRef.update(held, (now) => ({ ...now, held: Option.none() }));
          return publish;
        }),
        view: Effect.sync(() => MutableRef.get(held)),
        changes: Stream.fromPubSub(views),
      });
    }),
  );
