import { describe, expect, it } from 'effect-bun-test';
import { Deferred, Effect, Exit, Fiber, Option, Ref } from 'effect';

import { memoSuccess } from './store-secret.ts';

type Answer = { readonly ok: boolean; readonly value: string };
type Command = { readonly calls: number; readonly answer: Answer };
type Outcome = { readonly ok: true; readonly value: string } | { readonly ok: false };
type Model = { kept: Option.Option<string>; reads: number; failures: number };

const random = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** 1 to 12 commands, each one call or a burst of 2 to 6 at once; the store answers a value or fails. */
const program = (seed: number): ReadonlyArray<Command> => {
  const next = random(seed);
  const length = 1 + Math.floor(next() * 12);
  return Array.from({ length }, (_, n): Command => {
    const answer = { ok: next() < 0.6, value: `v${seed}-${n}` };
    if (next() < 0.4) return { calls: 2 + Math.floor(next() * 5), answer };
    return { calls: 1, answer };
  });
};

const outcomeOf = Exit.match<string, string, Outcome, Outcome>({
  onSuccess: (value) => ({ ok: true, value }),
  onFailure: () => ({ ok: false }),
});

/** A store whose answer the test sets, which counts its reads and can hold them until opened. */
const makeStore = Effect.gen(function* () {
  const answer = yield* Ref.make<Answer>({ ok: true, value: '' });
  const reads = yield* Ref.make(0);
  const gate = yield* Ref.make(Option.none<Deferred.Deferred<void>>());
  const source = Effect.gen(function* () {
    yield* Ref.update(reads, (n) => n + 1);
    const held = yield* Ref.get(gate);
    if (Option.isSome(held)) yield* Deferred.await(held.value);
    const { ok, value } = yield* Ref.get(answer);
    if (!ok) return yield* Effect.fail('down');
    return value;
  });
  return { answer, reads, gate, source };
});

type Store = Effect.Success<typeof makeStore>;

/** The command's calls: one, or a burst held inside the read until every call has started. */
const perform = (store: Store, get: Effect.Effect<string, string>, command: Command) =>
  Effect.gen(function* () {
    yield* Ref.set(store.answer, command.answer);
    if (command.calls === 1) return [outcomeOf(yield* Effect.exit(get))];
    const opened = yield* Deferred.make<void>();
    yield* Ref.set(store.gate, Option.some(opened));
    const fibers = [];
    for (let n = 0; n < command.calls; n += 1)
      fibers.push(yield* Effect.forkChild(Effect.exit(get)));
    for (let n = 0; n < command.calls + 4; n += 1) yield* Effect.yieldNow;
    yield* Deferred.done(opened, Exit.void);
    const exits = [];
    for (const fiber of fibers) exits.push(yield* Fiber.join(fiber));
    yield* Ref.set(store.gate, Option.none());
    return exits.map(outcomeOf);
  });

/** The model's outcome of a command, every call alike, and its reads after it. */
const step = (model: Model, command: Command): Outcome => {
  if (Option.isSome(model.kept)) return { ok: true, value: model.kept.value };
  model.reads += 1;
  if (!command.answer.ok) {
    model.failures += 1;
    return { ok: false };
  }
  model.kept = Option.some(command.answer.value);
  return { ok: true, value: command.answer.value };
};

const run = (commands: ReadonlyArray<Command>) =>
  Effect.gen(function* () {
    const store = yield* makeStore;
    const get = yield* memoSuccess(store.source);
    expect(yield* Ref.get(store.reads)).toBe(0);
    const model: Model = { kept: Option.none(), reads: 0, failures: 0 };
    for (const [index, command] of commands.entries()) {
      const outcomes = yield* perform(store, get, command);
      const expected = step(model, command);
      const reads = yield* Ref.get(store.reads);
      expect({ index, outcomes, reads }).toEqual({
        index,
        outcomes: Array.from({ length: command.calls }, () => expected),
        reads: model.reads,
      });
      expect(reads).toBeLessThanOrEqual(model.failures + 1);
    }
  });

describe('memoSuccess', () => {
  it.effect('agrees with the model over 100 generated programs', () =>
    Effect.gen(function* () {
      for (let seed = 1; seed <= 100; seed += 1) yield* run(program(seed));
    }),
  );

  it.effect('reads again for the callers waiting on a leader that was interrupted', () =>
    Effect.gen(function* () {
      const store = yield* makeStore;
      const get = yield* memoSuccess(store.source);
      yield* Ref.set(store.answer, { ok: true, value: 'kept' });
      const held = yield* Deferred.make<void>();
      yield* Ref.set(store.gate, Option.some(held));
      const leader = yield* Effect.forkChild(get);
      yield* Effect.yieldNow;
      const waiters = [];
      for (let n = 0; n < 3; n += 1) waiters.push(yield* Effect.forkChild(get));
      yield* Effect.yieldNow;
      yield* Ref.set(store.gate, Option.none());
      yield* Fiber.interrupt(leader);
      const values = [];
      for (const waiter of waiters) values.push(yield* Fiber.join(waiter));
      expect(values).toEqual(['kept', 'kept', 'kept']);
      expect(yield* get).toBe('kept');
      expect(yield* Ref.get(store.reads)).toBe(2);
    }),
  );
});
