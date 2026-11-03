import type { Fiber } from 'effect';
import { Clock, Deferred, Duration, Effect, Exit, Option } from 'effect';

export interface Batcher<I, O, E> {
  readonly submit: (input: I) => Effect.Effect<O, E>;
}

interface Slot<I, O, E> {
  readonly input: I;
  readonly deferred: Deferred.Deferred<O, E>;
}

interface Batch<I, O, E> {
  readonly slots: Slot<I, O, E>[];
  waiting: number;
  sent: boolean;
  due: number;
  fiber: Option.Option<Fiber.Fiber<void>>;
}

export const makeBatcher = <I, O, E>(options: {
  readonly window: Duration.Input;
  readonly maxSize: number;
  readonly run: (inputs: ReadonlyArray<I>) => Effect.Effect<ReadonlyArray<Exit.Exit<O, E>>, E>;
}): Batcher<I, O, E> => {
  let open = Option.none<Batch<I, O, E>>();
  const window = Duration.toMillis(options.window);
  const elapsed = Effect.map(Clock.monotonicTimeNanos, (nanos) => Number(nanos / 1_000_000n));

  const quiet = (batch: Batch<I, O, E>): Effect.Effect<void> =>
    Effect.flatMap(elapsed, (at) => {
      if (at >= batch.due) return Effect.void;
      return Effect.andThen(Effect.sleep(batch.due - at), quiet(batch));
    });

  const close = (batch: Batch<I, O, E>): void => {
    if (Option.exists(open, (current) => current === batch)) open = Option.none();
  };

  const send = (batch: Batch<I, O, E>) =>
    Effect.gen(function* () {
      close(batch);
      batch.sent = true;
      const exit = yield* Effect.exit(options.run(batch.slots.map((slot) => slot.input)));
      batch.slots.forEach((slot, index) => {
        if (Exit.isFailure(exit)) {
          Deferred.doneUnsafe(slot.deferred, Exit.failCause(exit.cause));
          return;
        }
        const answer = Option.fromUndefinedOr(exit.value[index]);
        Deferred.doneUnsafe(
          slot.deferred,
          Option.getOrElse(answer, () =>
            Exit.die(`batch answered ${String(exit.value.length)} of its inputs`),
          ),
        );
      });
    });

  const start = (at: number) =>
    Effect.gen(function* () {
      const batch: Batch<I, O, E> = {
        slots: [],
        waiting: 0,
        sent: false,
        due: at + window,
        fiber: Option.none(),
      };
      open = Option.some(batch);
      batch.fiber = Option.some(
        yield* Effect.forkDetach(Effect.andThen(quiet(batch), send(batch))),
      );
      return batch;
    });

  const leave = (batch: Batch<I, O, E>, slot: Slot<I, O, E>): void => {
    if (!batch.sent) batch.slots.splice(batch.slots.indexOf(slot), 1);
    batch.waiting -= 1;
    if (batch.waiting > 0) return;
    close(batch);
    if (Option.isSome(batch.fiber)) batch.fiber.value.interruptUnsafe();
  };

  return {
    submit: (input) =>
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const at = yield* elapsed;
          const batch = yield* Option.match(open, {
            onNone: () => start(at),
            onSome: Effect.succeed,
          });
          const slot: Slot<I, O, E> = { input, deferred: Deferred.makeUnsafe<O, E>() };
          batch.slots.push(slot);
          batch.waiting += 1;
          batch.due = at + window;
          if (batch.slots.length >= options.maxSize) close(batch);
          return yield* restore(Deferred.await(slot.deferred)).pipe(
            Effect.onInterrupt(() => Effect.sync(() => leave(batch, slot))),
          );
        }),
      ),
  };
};
