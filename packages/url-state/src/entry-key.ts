import { Clock, Effect, Ref } from 'effect';

export const makeEntryKeys: Effect.Effect<Effect.Effect<string>> = Effect.map(
  Ref.make(0),
  (count) =>
    Effect.gen(function* () {
      const n = yield* Ref.updateAndGet(count, (value) => value + 1);
      const now = yield* Clock.currentTimeMillis;
      return `${String(now)}-${String(n)}`;
    }),
);
