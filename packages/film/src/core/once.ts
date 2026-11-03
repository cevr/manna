import { Effect, Fiber, Option, type Scope, SynchronizedRef } from 'effect';

export const onceScoped = <A, E, R>(
  self: Effect.Effect<A, E, R>,
): Effect.Effect<Effect.Effect<A, E, R>, never, Scope.Scope> =>
  Effect.map(
    Effect.all([Effect.scope, SynchronizedRef.make(Option.none<Fiber.Fiber<A, E>>())]),
    ([scope, started]) =>
      Effect.flatMap(
        Effect.uninterruptible(
          SynchronizedRef.modifyEffect(started, (current) =>
            Option.match(current, {
              onSome: (fiber) => Effect.succeed([fiber, current] as const),
              onNone: () =>
                Effect.map(
                  Effect.forkIn(self, scope),
                  (fiber) => [fiber, Option.some(fiber)] as const,
                ),
            }),
          ),
        ),
        Fiber.join,
      ),
  );
