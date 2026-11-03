import {
  Clock,
  Context,
  Duration,
  Effect,
  FiberHandle,
  Layer,
  Option,
  Order,
  Ref,
  Scheduler,
  Stream,
  SubscriptionRef,
} from 'effect';

import { Location, type Entry } from './location.js';
import * as Place from './place.js';

export interface UrlStateService {
  readonly href: Effect.Effect<string>;
  readonly changes: Stream.Stream<string>;
  readonly navigate: (href: string, move: Place.Move) => Effect.Effect<void>;
}

export class UrlState extends Context.Service<UrlState, UrlStateService>()(
  '@manna/url-state/UrlState',
) {}

interface Batch {
  readonly href: string;
  readonly move: Place.Move;
  readonly entry: string;
}

const fold = (earlier: Place.Move, later: Place.Move): Place.Move => ({
  history: Option.match(
    Option.liftPredicate(later.history, (history) => history === 'push'),
    { onSome: () => 'push', onNone: () => earlier.history },
  ),
  throttle: Option.zipWith(earlier.throttle, later.throttle, Order.max(Duration.Order)),
});

export const layer: Layer.Layer<UrlState, never, Location> = Layer.effect(
  UrlState,
  Effect.gen(function* () {
    const location = yield* Location;
    const microtasks = new Scheduler.MixedScheduler('sync');
    const pending = yield* Ref.make(Option.none<Batch>());
    const view = yield* SubscriptionRef.make((yield* location.current).href);
    const flushing = yield* FiberHandle.make<void, never>();
    const lastFlush = yield* Ref.make(Option.none<number>());

    const waitFor = (batch: Batch) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        const last = yield* Ref.get(lastFlush);
        return Option.match(
          Option.zipWith(batch.move.throttle, last, (window, at) => ({ window, at })),
          {
            onNone: () => 0,
            onSome: ({ window, at }) => Math.max(0, at + Duration.toMillis(window) - now),
          },
        );
      });

    const due: Effect.Effect<void> = Effect.suspend(() =>
      Effect.gen(function* () {
        const waiting = yield* Ref.get(pending);
        if (Option.isNone(waiting)) return;
        const wait = yield* waitFor(waiting.value);
        if (wait <= 0) return;
        yield* Effect.sleep(Duration.millis(wait));
        yield* due;
      }),
    );

    const commit = Effect.gen(function* () {
      yield* due;
      const batch = yield* Ref.getAndSet(pending, Option.none());
      if (Option.isNone(batch)) return;
      const { href, move, entry } = batch.value;
      const current = yield* location.current;
      if (current.key !== entry) {
        yield* Effect.logDebug(`url-state.flush.dropped href=${href}`);
        yield* SubscriptionRef.set(view, current.href);
        return;
      }
      if (href === current.href) return;
      yield* Effect.logDebug(`url-state.flush history=${move.history} href=${href}`);
      if (move.history === 'push') yield* location.push(href);
      else yield* location.replace(href);
      yield* Ref.set(lastFlush, Option.some(yield* Clock.currentTimeMillis));
    });

    const drain: Effect.Effect<void> = Effect.suspend(() =>
      Effect.gen(function* () {
        yield* commit;
        if (Option.isSome(yield* Ref.get(pending))) yield* drain;
      }),
    );

    const flush = Effect.gen(function* () {
      yield* Effect.yieldNow;
      yield* drain;
    }).pipe(Effect.provideService(Scheduler.Scheduler, microtasks));

    const navigate = Effect.fn('UrlState.navigate')(function* (href: string, move: Place.Move) {
      const { key } = yield* location.current;
      const batch = yield* Ref.updateAndGet(pending, (waiting) =>
        Option.some(
          Option.match(waiting, {
            onNone: (): Batch => ({ href, move, entry: key }),
            onSome: (earlier): Batch => ({ ...earlier, href, move: fold(earlier.move, move) }),
          }),
        ),
      );
      yield* SubscriptionRef.set(view, href);
      const throttled = Option.isSome(Option.flatMap(batch, (folded) => folded.move.throttle));
      yield* FiberHandle.run(flushing, flush, { onlyIfMissing: throttled });
    });

    const land = (entry: Entry) =>
      Effect.gen(function* () {
        const elsewhere = Option.exists(
          yield* Ref.get(pending),
          (batch) => batch.entry !== entry.key,
        );
        if (elsewhere) {
          yield* Effect.logDebug(`url-state.landed.dropped key=${entry.key}`);
          yield* FiberHandle.clear(flushing);
          yield* Ref.set(pending, Option.none());
        }
        if (Option.isNone(yield* Ref.get(pending))) yield* SubscriptionRef.set(view, entry.href);
      });
    yield* location.changes.pipe(
      Stream.runForEach(land),
      Effect.provideService(Scheduler.Scheduler, microtasks),
      Effect.forkScoped,
    );

    return UrlState.of({
      href: Effect.flatMap(Ref.get(pending), (waiting) =>
        Option.match(waiting, {
          onSome: (batch) => Effect.succeed(batch.href),
          onNone: () => Effect.map(location.current, (entry) => entry.href),
        }),
      ),
      changes: SubscriptionRef.changes(view),
      navigate,
    });
  }),
);

export const get = <A>(place: Place.Place<A>): Effect.Effect<Option.Option<A>, never, UrlState> =>
  UrlState.use((state) => Effect.flatMap(state.href, (href) => Place.decodeEffect(place, href)));

export const set = <A>(place: Place.Place<A>, value: A): Effect.Effect<void, never, UrlState> =>
  UrlState.use((state) =>
    Effect.gen(function* () {
      const from = yield* state.href;
      const to = Place.href(place, value);
      if (to === from) return;
      yield* state.navigate(to, Place.history(place, from, to));
    }),
  );

export const update = <A>(
  place: Place.Place<A>,
  f: (value: A) => A,
): Effect.Effect<void, never, UrlState> =>
  Effect.flatMap(get(place), (value) =>
    Option.match(value, { onNone: () => Effect.void, onSome: (current) => set(place, f(current)) }),
  );
