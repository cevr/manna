import { Effect, Option, Scope, Semaphore } from 'effect';

/**
 * A process-wide resource held by the scopes that use it: the first hold
 * starts it, the last release stops it, and a hold after that starts a new
 * one (a generation of its own). Every caller of the resource holds it for
 * as long as it uses it, so no release stops it under a holder still at work.
 */
export interface Lease<A> {
  /** The resource that runs now, held until the scope closes; started when none runs. */
  readonly hold: Effect.Effect<A, never, Scope.Scope>;
  /** How many scopes hold it now. */
  readonly holders: Effect.Effect<number>;
}

/**
 * A lease over what `start` makes and `stop` ends. A hold and a release are
 * one at a time, so a release that stops the resource never races a hold
 * that would keep it; a hold the scope interrupts holds nothing, and a
 * release stops only the generation it held (`stop` is given it).
 */
export const makeLease = <A>(start: Effect.Effect<A>, stop: (held: A) => Effect.Effect<void>) => {
  const one = Semaphore.makeUnsafe(1);
  let holders = 0;
  let current: Option.Option<A> = Option.none();
  const take = one.withPermits(1)(
    Effect.suspend(() => {
      holders += 1;
      return Option.match(current, {
        onSome: Effect.succeed,
        onNone: () =>
          Effect.tap(start, (made) =>
            Effect.sync(() => {
              current = Option.some(made);
            }),
          ),
      });
    }),
  );
  const give = (held: A) =>
    one.withPermits(1)(
      Effect.suspend(() => {
        holders -= 1;
        if (holders > 0) return Effect.void;
        current = Option.none();
        return stop(held);
      }),
    );
  const lease: Lease<A> = {
    hold: Effect.acquireRelease(take, give),
    holders: Effect.sync(() => holders),
  };
  return lease;
};

/**
 * `acquire` (a resource scoped to the caller) under `lease`: held from
 * before `acquire` starts until after the resource's own release has run,
 * in a scope of its own inside the caller's. An `acquire` that fails or is
 * interrupted gives the lease back at once, so a resource that never opened
 * holds nothing. `acquire` is given what the lease holds.
 */
export const leased = <L, A, E, R>(
  lease: Lease<L>,
  acquire: (held: L) => Effect.Effect<A, E, R | Scope.Scope>,
): Effect.Effect<A, E, Exclude<R, Scope.Scope> | Scope.Scope> =>
  Effect.gen(function* () {
    const own = yield* Scope.fork(yield* Scope.Scope);
    return yield* Effect.flatMap(lease.hold, acquire).pipe(
      Scope.provide(own),
      Effect.onExit((exit) =>
        Effect.when(Scope.close(own, exit), Effect.succeed(exit._tag === 'Failure')),
      ),
    );
  });
