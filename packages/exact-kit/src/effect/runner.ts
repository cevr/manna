/* oxlint-disable effect/noNewPromise, effect/noAsyncFunction, no-await-in-loop, effect/noGlobals, effect/noThrowStatement -- the runner is Exact's boundary: an answer gets a Promise or a value (a failure thrown), a sleep waits on the answer's own setTimeout, and the driver steps by `await`, the one way Exact carries an answer across turns */
import { Cause, Clock, Duration, Effect, Exit, Random, Scheduler, type Fiber } from 'effect';

/** What Exact hands a source call: its time (`time.epochAtZero + performanceNow()`) and a seed (`time.seed`). */
export interface Call {
  readonly now: number;
  readonly seed: number;
}

/**
 * How a call waits out a sleep: `wait(millis)` resolves once the app's clock has moved that far (the answer's own
 * `setTimeout`, which Exact allows and fires on its clock), and `turn(run)` runs each step of the call's fibers
 * (identity in an app; a test runs each step under `withDataHost`).
 */
export interface Host {
  readonly wait?: (millis: number) => Promise<void>;
  readonly turn?: <A>(run: () => A) => A;
}

/** What the call's fibers wait on: each sleep by its deadline on the call's clock, ties in the order they began. */
interface Sleeper {
  readonly due: number;
  readonly order: number;
  readonly wake: () => void;
  readonly fiber: Fiber.Fiber<unknown, unknown>;
}

/** A step a fiber scheduled, until it runs or is cancelled. */
interface Task {
  readonly run: () => void;
  live: boolean;
}

const NANOS_PER_MILLI = BigInt(1_000_000);

const defaultWait = (millis: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, millis);
  });

const identity = <A>(run: () => A) => run();

const ignore = (): void => {};

/**
 * One call's world: a clock that reads the call's time and moves only to the deadline of the sleep it wakes, the
 * call's seed as `Random`, and a scheduler whose steps the driver runs. Nothing in it reads Exact's refused globals.
 */
const makeWorld = (call: Call) => {
  let now = call.now;
  let order = 0;
  const sleepers: Array<Sleeper> = [];
  const tasks: Array<Task> = [];
  let poke = ignore;

  const insert = (sleeper: Sleeper) => {
    const at = sleepers.findIndex(
      (s) => s.due > sleeper.due || (s.due === sleeper.due && s.order > sleeper.order),
    );
    if (at === -1) sleepers.push(sleeper);
    else sleepers.splice(at, 0, sleeper);
    poke();
  };
  const remove = (sleeper: Sleeper) => {
    const at = sleepers.indexOf(sleeper);
    if (at !== -1) sleepers.splice(at, 1);
  };

  const sleepMillis = (millis: number): Effect.Effect<void> => {
    if (millis <= 0) return Effect.yieldNow;
    if (!Number.isFinite(millis)) return Effect.never;
    return Effect.withFiber((fiber) =>
      Effect.callback<void>((resume) => {
        const sleeper: Sleeper = {
          due: now + millis,
          order: order++,
          wake: () => resume(Effect.void),
          fiber,
        };
        insert(sleeper);
        return Effect.sync(() => remove(sleeper));
      }),
    );
  };

  const clock: Clock.Clock = {
    currentTimeMillisUnsafe: () => now,
    currentTimeMillis: Effect.sync(() => now),
    currentTimeNanosUnsafe: () => BigInt(Math.round(now)) * NANOS_PER_MILLI,
    currentTimeNanos: Effect.sync(() => BigInt(Math.round(now)) * NANOS_PER_MILLI),
    monotonicTimeNanosUnsafe: () => BigInt(Math.round(now - call.now)) * NANOS_PER_MILLI,
    monotonicTimeNanos: Effect.sync(() => BigInt(Math.round(now - call.now)) * NANOS_PER_MILLI),
    sleep: (duration) => sleepMillis(Duration.toMillis(duration)),
  };

  const scheduler = new Scheduler.MixedScheduler('async', (run) => {
    const task: Task = { run, live: true };
    tasks.push(task);
    poke();
    return () => {
      task.live = false;
    };
  });

  return {
    clock,
    scheduler,
    sleepers,
    tasks,
    remove,
    seed: call.seed,
    advanceTo: (due: number) => {
      now = Math.max(now, due);
    },
    onPoke: (f: () => void) => {
      poke = f;
    },
    poke: () => poke(),
  };
};

type World = ReturnType<typeof makeWorld>;

/** Runs every step the fibers scheduled, each through `turn`, until none is left. */
const drain = (world: World, turn: <A>(run: () => A) => A) => {
  for (let task = world.tasks.shift(); task; task = world.tasks.shift()) {
    const { run } = task;
    if (task.live) turn(run);
  }
};

/** Interrupts each fiber still asleep once the call's own fiber is done, so nothing of the call outlives it. */
const endSleepers = (world: World, turn: <A>(run: () => A) => A) => {
  const left = world.sleepers.splice(0);
  for (const sleeper of left) turn(() => sleeper.fiber.interruptUnsafe());
  return left.length > 0;
};

/** Where the call stands once no step is left: done, asleep until its earliest sleeper's deadline, or waiting outside. */
type Settled<A, E> =
  | { readonly _tag: 'done'; readonly exit: Exit.Exit<A, E> }
  | { readonly _tag: 'asleep'; readonly next: Sleeper }
  | { readonly _tag: 'outside' };

/** Runs the scheduled steps until none is left; once the call's fiber is done, ends its sleepers and runs theirs. */
const settle = <A, E>(
  world: World,
  fiber: Fiber.Fiber<A, E>,
  turn: <B>(run: () => B) => B,
): Settled<A, E> => {
  for (;;) {
    drain(world, turn);
    const exit = fiber.pollUnsafe();
    if (exit && !endSleepers(world, turn)) return { _tag: 'done', exit };
    if (!exit) {
      const [next] = world.sleepers;
      if (next) return { _tag: 'asleep', next };
      return { _tag: 'outside' };
    }
  }
};

/** Wakes `sleeper` at its deadline: the call's clock moves there, and only there. */
const wake = (world: World, sleeper: Sleeper, turn: <B>(run: () => B) => B) => {
  world.remove(sleeper);
  world.advanceTo(sleeper.due);
  turn(sleeper.wake);
};

/** Drives the call with virtual time: each sleeper wakes at once, at its deadline, until the call's fiber is done. */
const driveNow = <A, E>(
  world: World,
  fiber: Fiber.Fiber<A, E>,
  turn: <B>(run: () => B) => B,
): Exit.Exit<A, E> => {
  for (;;) {
    const settled = settle(world, fiber, turn);
    if (settled._tag === 'done') return settled.exit;
    if (settled._tag === 'outside')
      return Exit.die(
        new Error('the call waits on something outside it; run it with runCall, not runCallSync'),
      );
    wake(world, settled.next, turn);
  }
};

/**
 * Drives the call on the host's clock: when no step is left, waits for the earliest sleeper's deadline through `wait`,
 * or for a step that something outside (a fetch) scheduled, whichever comes first. An `async` function, so that
 * Exact's bundle resumes each step after an `await` as the answer's own turn, where its `setTimeout` may be armed.
 */
const driveLater = async <A, E>(
  world: World,
  fiber: Fiber.Fiber<A, E>,
  turn: <B>(run: () => B) => B,
  wait: (millis: number) => Promise<void>,
): Promise<Exit.Exit<A, E>> => {
  for (;;) {
    const settled = settle(world, fiber, turn);
    if (settled._tag === 'done') return settled.exit;
    const poked = new Promise<boolean>((resolve) => world.onPoke(() => resolve(false)));
    if (settled._tag === 'outside') await poked;
    else {
      const { next } = settled;
      const due = wait(Math.max(0, next.due - world.clock.currentTimeMillisUnsafe()));
      const timed = await Promise.race([due.then(() => true), poked]);
      if (timed && world.sleepers[0] === next) {
        world.onPoke(ignore);
        wake(world, next, turn);
      }
    }
    world.onPoke(ignore);
  }
};

const start = <A, E>(effect: Effect.Effect<A, E>, call: Call, turn: <B>(run: () => B) => B) => {
  const world = makeWorld(call);
  const program = effect.pipe(
    Effect.provideService(Clock.Clock, world.clock),
    Random.withSeed(world.seed),
  );
  const fiber = turn(() => Effect.runFork(program, { scheduler: world.scheduler }));
  fiber.addObserver(() => world.poke());
  return { world, fiber };
};

const valueOf = <A, E>(exit: Exit.Exit<A, E>): A => {
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
};

/**
 * Runs `effect` for one Exact call: its clock reads `call.now` and moves only to the deadline of each sleep it wakes,
 * its `Random` is seeded with `call.seed`, and its fibers run on a scheduler of the call's own. A sleep waits through
 * `host.wait` (by default the answer's own `setTimeout`, on the app's clock). When the call's fiber ends, every fiber
 * of the call still asleep is interrupted, so no fiber and no timer outlives the call. Its value, or its failure thrown.
 */
export const runCall = <A, E>(
  effect: Effect.Effect<A, E>,
  call: Call,
  host: Host = {},
): Promise<A> => {
  const turn = host.turn ?? identity;
  const { world, fiber } = start(effect, call, turn);
  return driveLater(world, fiber, turn, host.wait ?? defaultWait).then(valueOf);
};

/**
 * `runCall` with time that jumps to each sleep's deadline at once, for a source that answers now: its value, or its
 * failure thrown. A call that waits on something outside it (a fetch, a promise) dies here; use `runCall`.
 */
export const runCallSync = <A, E>(
  effect: Effect.Effect<A, E>,
  call: Call,
  host: Pick<Host, 'turn'> = {},
): A => {
  const turn = host.turn ?? identity;
  const { world, fiber } = start(effect, call, turn);
  return valueOf(driveNow(world, fiber, turn));
};
