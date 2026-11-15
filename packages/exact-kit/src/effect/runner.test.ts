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

import type * as Declared from '@manna/exact-kit/effect';

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
]);
type Step = typeof Step.Type;

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

/** The program `steps` make: each fork runs its body in a child fiber, each join takes the latest child not joined. */
const program = (steps: ReadonlyArray<Step>) =>
  Effect.gen(function* () {
    const trace: Trace = [];
    const children: Array<Fiber.Fiber<Trace>> = [];
    for (const step of steps) {
      if (step._tag === 'fork') {
        const body = Effect.gen(function* () {
          const own: Trace = [];
          for (const inner of step.body) yield* leaf(inner, own);
          return own;
        });
        children.push(yield* Effect.forkChild(body));
      } else if (step._tag === 'join') {
        const child = children.pop();
        if (child) trace.push(['join', yield* Fiber.join(child)]);
      } else yield* leaf(step, trace);
    }
    return trace;
  });

/** The same program under Effect's `TestClock` at `start` and `Random.withSeed(seed)`, time moved on until it ends. */
const underTestClock = (steps: ReadonlyArray<Step>, start: number, seed: number) =>
  Effect.runPromise(
    Effect.gen(function* () {
      yield* TestClock.setTime(start);
      const fiber = yield* Effect.forkChild(Random.withSeed(program(steps), seed));
      yield* TestClock.adjust(1_000_000);
      return yield* Fiber.join(fiber);
    }).pipe(Effect.provide(TestClock.layer())),
  );

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
  it.effect('its declarations for Exact (exact.d.ts) say what runner.ts does', () =>
    Effect.sync(() => expect(DECLARED).toEqual([true, true, true, true])),
  );

  it.effect(
    "gives any program built from sleeps, clock reads, draws, forks, joins, races, timeouts and streams TestClock's result at the call's time and seed, calling no refused global",
    () =>
      Effect.gen(function* () {
        const result = yield* Arbitrary.checkEffect(
          Case,
          ({ steps, start, seed }) =>
            Effect.promise(async () => {
              const expected = await underTestClock(steps, start, seed);
              const now = runCallSync(program(steps), { now: start, seed }, { turn: withDataHost });
              const later = await runCall(
                program(steps),
                { now: start, seed },
                { turn: withDataHost, wait: () => Promise.resolve() },
              );
              return Bun.deepEquals(now, expected) && Bun.deepEquals(later, expected);
            }),
          { runs: 60 },
        );
        expect(Arbitrary.formatCheckFailure(result)).toBeUndefined();
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
          { runs: 60 },
        );
        expect(Arbitrary.formatCheckFailure(result)).toBeUndefined();
      }),
  );
});
