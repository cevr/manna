import { Effect, Option, type Scope } from 'effect';
import type { View } from './tab.ts';

export interface Leased {
  readonly lent: View;
}

export const fromIdle = <S>(idle: Array<S>, make: Effect.Effect<S>): Effect.Effect<S> =>
  Effect.suspend(() =>
    Option.match(Option.fromUndefinedOr(idle.pop()), {
      onNone: () => make,
      onSome: Effect.succeed,
    }),
  );

export interface Pool<S extends Leased> {
  readonly take: Effect.Effect<S>;
  readonly giveBack: (slot: S) => void;
  readonly discard: (slot: S) => void;
  readonly blank: (slot: S) => Effect.Effect<void, unknown>;
}

export interface Ask {
  readonly width: number;
  readonly height: number;
  readonly coarse: boolean;
}

const touch = (view: View, enabled: boolean) =>
  Effect.andThen(
    Effect.tryPromise(() =>
      view.cdp('Emulation.setTouchEmulationEnabled', { enabled, maxTouchPoints: 5 }),
    ),
    Effect.tryPromise(() => view.cdp('Emulation.setScrollbarsHidden', { hidden: enabled })),
  );

export const lease = <S extends Leased>(
  pool: Pool<S>,
  ask: Ask,
): Effect.Effect<S, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.gen(function* () {
      const slot = yield* pool.take;
      yield* Effect.gen(function* () {
        yield* Effect.tryPromise(() => slot.lent.resize(ask.width, ask.height));
        if (ask.coarse) yield* touch(slot.lent, true);
      }).pipe(
        Effect.onError(() => Effect.sync(() => pool.discard(slot))),
        Effect.orDie,
      );
      return slot;
    }),
    (slot) =>
      Effect.gen(function* () {
        if (ask.coarse) yield* touch(slot.lent, false);
        yield* pool.blank(slot);
        yield* Effect.sync(() => pool.giveBack(slot));
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.andThen(
            Effect.logWarning('pool.view.discarded', cause),
            Effect.sync(() => pool.discard(slot)),
          ),
        ),
      ),
  );
