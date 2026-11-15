/* oxlint-disable effect/noNewPromise, effect/noAsyncFunction, no-await-in-loop, effect/noGlobals, effect/noFixedWaitInTests -- the subject is the runner's Promise face to Exact: the model host is Exact's promise-based timers, fired one at a time, and the sleeps are the programs under test on the runner's virtual clock */
import {
  Array as Arr,
  Clock,
  Effect,
  Fiber,
  Match,
  Option,
  Order,
  Random,
  Schema,
  Stream,
} from 'effect';
import * as Arbitrary from 'effect/Arbitrary';
import { TestClock } from 'effect/testing';
import { describe, expect, it } from 'effect-bun-test';

import type * as Declared from './runner.d.ts';

import { withDataHost } from '../data-host/testing.ts';
import { runCall, runCallSync, type Call, type Host } from './runner.ts';

/** Whether `A` and `B` are each assignable to the other: the declarations Exact reads say what the source does. */
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const DECLARED: [
  Mutual<typeof runCall, typeof Declared.runCall>,
  Mutual<typeof runCallSync, typeof Declared.runCallSync>,
  Mutual<Call, Declared.Call>,
  Mutual<Host, Declared.Host>,
] = [true, true, true, true];

const millis = (maximum: number) => Schema.Int.check(Schema.isBetween({ minimum: 1, maximum }));

const Leaf = Schema.Union([
  Schema.TaggedStruct('sleep', { ms: millis(30) }),
  Schema.TaggedStruct('now', {}),
  Schema.TaggedStruct('random', {}),
  Schema.TaggedStruct('race', { a: millis(30), b: millis(30) }),
  Schema.TaggedStruct('timeout', { ms: millis(30), limit: millis(30) }),
  Schema.TaggedStruct('stream', {
    take: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 4 })),
    every: millis(20),
  }),
]);
type Leaf = typeof Leaf.Type;

const Step = Schema.Union([
  Leaf,
  Schema.TaggedStruct('fork', { body: Schema.Array(Leaf).check(Schema.isMaxLength(4)) }),
  Schema.TaggedStruct('join', {}),
  Schema.TaggedStruct('outside', {
    after: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 3 })),
  }),
]);
type Step = typeof Step.Type;

/**
 * How a program meets an outside wait: on the runner it awaits a promise from outside the call (a fetch's stand-in)
 * that settles after `after` turns of the host's event loop; in the reference under `TestClock` it awaits every child
 * forked so far, which is what the runner promises while the call waits outside: its other fibers sleep on to their
 * deadlines, the clock moving only to those, and then the call goes on.
 */
type Outside = 'promise' | 'children';

/** A promise from outside the call: it settles after `after` turns of the event loop, which no step of the call drives. */
const outsideAfter = (after: number) =>
  new Promise<void>((resolve) => {
    const tick = (left: number) => {
      if (left === 0) resolve();
      else setImmediate(() => tick(left - 1));
    };
    tick(after);
  });

/** The runner's own words when a call that waits outside it is run with `runCallSync`. */
const SYNC_OUTSIDE = 'the call waits on something outside it; run it with runCall, not runCallSync';

/** What a program saw, in its order: clock reads, draws, winners, timeouts, stream items, joined children's traces. */
type Trace = Array<unknown>;

const leaf = (step: Leaf, trace: Trace): Effect.Effect<void> =>
  Match.valueTags(step, {
    sleep: ({ ms }) => Effect.sleep(ms),
    now: () => Effect.map(Clock.currentTimeMillis, (t) => void trace.push(['now', t])),
    random: () => Effect.map(Random.nextIntBetween(0, 1000), (n) => void trace.push(['random', n])),
    race: ({ a, b }) =>
      Effect.race(Effect.as(Effect.sleep(a), 'a'), Effect.as(Effect.sleep(b), 'b')).pipe(
        Effect.flatMap((won) =>
          Effect.map(Clock.currentTimeMillis, (t) => void trace.push(['race', won, t])),
        ),
      ),
    timeout: ({ ms, limit }) =>
      Effect.timeoutOption(Effect.sleep(ms), limit).pipe(
        Effect.flatMap((done) =>
          Effect.map(
            Clock.currentTimeMillis,
            (t) => void trace.push(['timeout', Option.isSome(done), t]),
          ),
        ),
      ),
    stream: ({ take, every }) =>
      Stream.iterate(0, (n) => n + 1).pipe(
        Stream.mapEffect((n) =>
          Effect.andThen(
            Effect.sleep(every),
            Effect.map(Clock.currentTimeMillis, (t) => [n, t]),
          ),
        ),
        Stream.take(take),
        Stream.runCollect,
        Effect.map((items) => void trace.push(['stream', items])),
      ),
  });

/**
 * The program `steps` make: each fork runs its body in a child fiber, each join takes the latest child not joined,
 * each outside wait is met as `outside` says and traced with the time the call goes on at.
 */
const program = (steps: ReadonlyArray<Step>, outside: Outside = 'promise') =>
  Effect.gen(function* () {
    const trace: Trace = [];
    const children: Array<Fiber.Fiber<Trace>> = [];
    const forked: Array<Fiber.Fiber<Trace>> = [];
    for (const step of steps) {
      if (step._tag === 'fork') {
        const body = Effect.gen(function* () {
          const own: Trace = [];
          for (const inner of step.body) yield* leaf(inner, own);
          return own;
        });
        const child = yield* Effect.forkChild(body);
        children.push(child);
        forked.push(child);
      } else if (step._tag === 'join') {
        const child = children.pop();
        if (child) trace.push(['join', yield* Fiber.join(child)]);
      } else if (step._tag === 'outside') {
        if (outside === 'promise') yield* Effect.promise(() => outsideAfter(step.after));
        else yield* Fiber.awaitAll(forked);
        trace.push(['outside', step.after, yield* Clock.currentTimeMillis]);
      } else yield* leaf(step, trace);
    }
    return trace;
  });

/**
 * How long, on the live clock, `TestClock` waits for a fiber it woke to suspend before it moves on: past bun's
 * timeout, so a host too loaded to run the fiber within TestClock's default second still gets TestClock's own result.
 */
const STALL_MS = 60_000;

/**
 * The same program under Effect's `TestClock` at `start` and `Random.withSeed(seed)`, time moved on until it ends.
 * It begins woken from a sleep that ends at `start`: `TestClock.adjust` waits for a woken fiber, and every fiber it
 * forks or resumes, to suspend before it looks at the next sleep, but it waits only one turn for a fiber it did not
 * wake, so a program that forks and joins before its first sleep would sleep past the adjustment and never wake.
 */
const underTestClock = (steps: ReadonlyArray<Step>, start: number, seed: number) =>
  Effect.runPromise(
    Effect.gen(function* () {
      yield* TestClock.setTime(start - 1);
      const fiber = yield* Effect.forkChild(
        Random.withSeed(Effect.andThen(Effect.sleep(1), program(steps, 'children')), seed),
      );
      yield* TestClock.adjust(1_000_000);
      return yield* Fiber.join(fiber);
    }).pipe(Effect.provide(TestClock.layer({ warningDelay: STALL_MS }))),
  );

/**
 * How much each property checks, fixed so its work is the same on every run at any load: the same generated cases
 * from one seed, and a failure shrunk at most `MAX_SHRINKS` times, so it is reported rather than shrunk past the
 * test's timeout. The cases from this seed kill every runner mutant the unit's mutant lists name.
 */
const CHECK = { runs: 60, seed: 1, maxShrinks: 40 } as const;

const Case = Arbitrary.all({
  steps: Arbitrary.array(Arbitrary.schema(Step), { maxLength: 8 }),
  start: Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 4e12 }))),
  seed: Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 2 ** 32 - 1 }))),
});

/** A host's clock for the model: `wait` arms a timer on it, `advance` fires the due ones in order, `reload` drops all. */
const makeHost = () => {
  let now = 0;
  let generation = 0;
  let timers: Array<{ readonly due: number; readonly fire: () => void }> = [];
  const settleMicrotasks = () =>
    new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  return {
    generation: () => generation,
    wait: (ms: number) =>
      new Promise<void>((resolve) => {
        timers.push({ due: now + ms, fire: resolve });
      }),
    advance: async (ms: number) => {
      const until = now + ms;
      for (;;) {
        const [next] = Arr.sort(
          timers.filter((t) => t.due <= until),
          Order.mapInput(Order.Number, (t: (typeof timers)[number]) => t.due),
        );
        if (!next) break;
        timers = timers.filter((t) => t !== next);
        now = Math.max(now, next.due);
        next.fire();
        await settleMicrotasks();
      }
      now = until;
      await settleMicrotasks();
    },
    reload: () => {
      timers = [];
      generation += 1;
    },
  };
};

const Command = Schema.Union([
  Schema.TaggedStruct('start', {
    at: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000 })),
    sleeps: Schema.Array(millis(50)).check(Schema.isMinLength(1), Schema.isMaxLength(3)),
    detached: Schema.Boolean,
  }),
  Schema.TaggedStruct('advance', { ms: millis(60) }),
  Schema.TaggedStruct('reload', {}),
]);

/** A wake a model call's fiber saw: which call and fiber, the time it read, the deadline it slept to, the host's generation. */
interface Seen {
  readonly call: number;
  readonly fiber: string;
  readonly at: number;
  readonly due: number;
  readonly generation: number;
}

describe('the Exact runner', () => {
  it.effect('its declarations for Exact (runner.d.ts) say what runner.ts does', () =>
    Effect.sync(() => expect(DECLARED).toEqual([true, true, true, true])),
  );

  it.effect(
    "gives any program built from sleeps, clock reads, draws, forks, joins, races, timeouts, streams and waits on a promise from outside, alone or beside sleeping children, TestClock's result at the call's time and seed, calling no refused global; runCallSync refuses the outside wait",
    () =>
      Effect.gen(function* () {
        const result = yield* Arbitrary.checkEffect(
          Case,
          ({ steps, start, seed }) =>
            Effect.promise(async () => {
              const expected = await underTestClock(steps, start, seed);
              const later = await runCall(
                program(steps),
                { now: start, seed },
                { turn: withDataHost, wait: () => Promise.resolve() },
              );
              const waitsOutside = steps.some((step) => step._tag === 'outside');
              const now = Effect.runSync(
                Effect.result(
                  Effect.try({
                    try: () =>
                      runCallSync(program(steps), { now: start, seed }, { turn: withDataHost }),
                    catch: (error) => String(error),
                  }),
                ),
              );
              const sync = Match.value(now).pipe(
                Match.tag(
                  'Failure',
                  ({ failure }) => waitsOutside && failure.includes(SYNC_OUTSIDE),
                ),
                Match.orElse(({ success }) => !waitsOutside && Bun.deepEquals(success, expected)),
              );
              return sync && Bun.deepEquals(later, expected);
            }),
          CHECK,
        );
        expect(Arbitrary.formatCheckFailure(result)).toBeUndefined();
      }),
  );

  it.effect('sleeps to one deadline wake in the order they began, now and later', () =>
    Effect.promise(async () => {
      const tie = Effect.all(
        [
          Effect.race(Effect.as(Effect.sleep(5), 'a'), Effect.as(Effect.sleep(5), 'b')),
          Effect.race(Effect.as(Effect.sleep(9), 'c'), Effect.as(Effect.sleep(9), 'd')),
        ],
        { concurrency: 'unbounded' },
      );
      const call = { now: 0, seed: 0 };
      expect(runCallSync(tie, call, { turn: withDataHost })).toEqual(['a', 'c']);
      expect(
        await runCall(tie, call, { turn: withDataHost, wait: () => Promise.resolve() }),
      ).toEqual(['a', 'c']);
    }),
  );

  it.effect(
    'a call waiting outside, alone and beside a sleeping child, goes on when the promise settles, on the host clock',
    () =>
      Effect.promise(async () => {
        const host = makeHost();
        const call = { now: 1000, seed: 3 };
        const alone = runCall(
          Effect.andThen(
            Effect.promise(() => outsideAfter(2)),
            Clock.currentTimeMillis,
          ),
          call,
          { wait: host.wait, turn: withDataHost },
        );
        const beside = runCall(
          Effect.gen(function* () {
            const child = yield* Effect.forkChild(
              Effect.andThen(Effect.sleep(40), Clock.currentTimeMillis),
            );
            yield* Effect.promise(() => outsideAfter(1));
            yield* Effect.yieldNow;
            const at = yield* Clock.currentTimeMillis;
            return [at, yield* Fiber.join(child)];
          }),
          call,
          { wait: host.wait, turn: withDataHost },
        );
        expect(await alone).toBe(1000);
        await host.advance(40);
        expect(await beside).toEqual([1000, 1040]);
      }),
  );

  it.effect(
    'across calls, overlapping ones, ones earlier than the last and a reload: time never runs back in a fiber, a sleeper wakes at or after its deadline, nothing runs after its call ends or the module reloads',
    () =>
      Effect.gen(function* () {
        const result = yield* Arbitrary.checkEffect(
          Arbitrary.array(Arbitrary.schema(Command), { maxLength: 12 }),
          (commands) =>
            Effect.promise(async () => {
              const host = makeHost();
              const seen: Array<Seen> = [];
              const ended = new Map<number, { readonly count: number; readonly child: boolean }>();
              const finished = new Set<number>();
              const started = new Map<number, number>();
              let calls = 0;
              const sleeper = (call: number, fiber: string, sleeps: ReadonlyArray<number>) =>
                Effect.forEach(
                  sleeps,
                  (ms) =>
                    Effect.gen(function* () {
                      const due = (yield* Clock.currentTimeMillis) + ms;
                      yield* Effect.sleep(ms);
                      const at = yield* Clock.currentTimeMillis;
                      seen.push({ call, fiber, at, due, generation: host.generation() });
                    }),
                  { discard: true },
                );
              for (const command of commands) {
                if (command._tag === 'advance') await host.advance(command.ms);
                else if (command._tag === 'reload') host.reload();
                else {
                  const call = calls++;
                  started.set(call, host.generation());
                  const fork = Match.value(command.detached).pipe(
                    Match.when(true, () => Effect.forkDetach),
                    Match.orElse(() => Effect.forkChild),
                  );
                  const child = sleeper(call, 'child', [...command.sleeps, ...command.sleeps]).pipe(
                    Effect.ensuring(Effect.sync(() => finished.add(call))),
                  );
                  const body = Effect.gen(function* () {
                    yield* fork(child);
                    yield* sleeper(call, 'main', command.sleeps);
                  });
                  void runCall(
                    body,
                    { now: command.at, seed: 1 },
                    { wait: host.wait, turn: withDataHost },
                  ).then(() => ended.set(call, { count: seen.length, child: finished.has(call) }));
                }
              }
              await host.advance(1000);
              const byFiber = Map.groupBy(seen, (s) => `${s.call}/${s.fiber}`);
              const forward = [...byFiber.values()].every((list) =>
                list.every((s, i) => i === 0 || s.at >= (list[i - 1]?.at ?? s.at)),
              );
              const onTime = seen.every((s) => s.at >= s.due);
              const noneAfterReload = seen.every((s) => s.generation === started.get(s.call));
              const noneAfterEnd = [...ended].every(
                ([call, { count, child }]) =>
                  child && !seen.slice(count).some((s) => s.call === call),
              );
              return forward && onTime && noneAfterReload && noneAfterEnd;
            }),
          CHECK,
        );
        expect(Arbitrary.formatCheckFailure(result)).toBeUndefined();
      }),
  );
});
