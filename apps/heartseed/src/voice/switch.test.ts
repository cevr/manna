/* oxlint-disable effect/noTernary, effect/noNullish, effect/noGlobals -- the harness drives the service from plain branches, reads a missing store key as undefined, and names each failing history as JSON text. */

/**
 * The off switch in command order: whatever order the source's stops
 * settle in, the stored switch and a restart follow the last `setEnabled`
 * call, and the view follows each call at once. Each stop is held on a
 * Deferred at the `VoiceSource` seam and released in a generated order,
 * while newer reads, stops and switch calls run past it.
 */

import { describe, expect, it } from 'bun:test';
import { Context, Deferred, Effect, Exit, Fiber, Layer, ManagedRuntime, Scope } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';

import { ENABLED_KEY, layer, Voice, VoiceSource } from '../voice';

const VERSE = 'Jesus wept.';

const random = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const pickOf = <A>(next: () => number, list: ReadonlyArray<A>): A => {
  const index = Math.floor(next() * list.length);
  return list[index] ?? list[0] ?? pickOf(next, list);
};

type Op = 'read' | 'off' | 'on' | 'stop' | 'settle-oldest' | 'settle-newest' | 'settle-any';

const OPS: ReadonlyArray<Op> = [
  'read',
  'read',
  'off',
  'off',
  'on',
  'on',
  'stop',
  'settle-oldest',
  'settle-newest',
  'settle-any',
];

/** A store over a map whose writes, in the `slow` form, yield before they land. */
const memoryStore = (backing: Map<string, string>, slow: boolean) =>
  KeyValueStore.makeStringOnly({
    get: (key) => Effect.sync(() => backing.get(key)),
    set: (key, value) => {
      const write = Effect.sync(() => void backing.set(key, value));
      if (slow) return Effect.andThen(Effect.yieldNow, write);
      return write;
    },
    remove: (key) => Effect.sync(() => void backing.delete(key)),
    clear: Effect.sync(() => backing.clear()),
    size: Effect.sync(() => backing.size),
    keys: Effect.sync(() => Array.from(backing.keys())),
  });

/** A source whose every stop waits on a Deferred the test releases, until `free` lets later stops through. */
const heldSource = () => {
  const held: Array<Deferred.Deferred<void>> = [];
  const free = { on: false };
  const source = VoiceSource.of({
    voices: Effect.succeed([]),
    speak: () => Effect.void,
    pause: Effect.void,
    resume: Effect.void,
    stop: Effect.suspend(() => {
      if (free.on) return Effect.void;
      const done = Deferred.makeUnsafe<void>();
      held.push(done);
      return Deferred.await(done);
    }),
    subscribe: () => Effect.void,
  });
  return { held, free, source };
};

const start = (deps: Layer.Layer<VoiceSource | KeyValueStore.KeyValueStore>) =>
  Effect.gen(function* () {
    const scope = yield* Scope.make();
    const services = yield* Layer.buildWithScope(Layer.provide(layer, deps), scope);
    return { scope, voice: Context.get(services, Voice) };
  });

/** Runs a command on its own fiber until it is done or waits on a stop it made. */
const launch = <A>(command: Effect.Effect<A>, held: ReadonlyArray<unknown>) =>
  Effect.gen(function* () {
    const before = held.length;
    const fiber = yield* Effect.forkChild(command);
    for (let turn = 0; turn < 64; turn++) {
      if (fiber.pollUnsafe() !== undefined || held.length > before) break;
      yield* Effect.yieldNow;
    }
    return fiber;
  });

const runHistory = (seed: number) =>
  Effect.gen(function* () {
    const next = random(seed);
    const stored = pickOf(next, [undefined, 'true', 'false']);
    const slow = next() < 0.5;
    const backing = new Map<string, string>();
    if (stored !== undefined) backing.set(ENABLED_KEY, stored);
    const fake = heldSource();
    const deps = Layer.mergeAll(
      Layer.succeed(VoiceSource, fake.source),
      Layer.succeed(KeyValueStore.KeyValueStore, memoryStore(backing, slow)),
    );
    const live = yield* start(deps);
    let expected = stored !== 'false';
    const fibers: Array<Fiber.Fiber<void>> = [];
    const trail: string[] = [`stored=${String(stored)} slow=${String(slow)}`];
    for (let i = 0; i < 14; i++) {
      const op = pickOf(next, OPS);
      trail.push(op);
      switch (op) {
        case 'read':
          fibers.push(yield* launch(live.voice.read(VERSE), fake.held));
          break;
        case 'stop':
          fibers.push(yield* launch(live.voice.stop, fake.held));
          break;
        case 'off':
        case 'on':
          expected = op === 'on';
          fibers.push(yield* launch(live.voice.setEnabled(expected), fake.held));
          break;
        case 'settle-oldest':
        case 'settle-newest':
        case 'settle-any': {
          if (fake.held.length === 0) break;
          const at = {
            'settle-oldest': 0,
            'settle-newest': fake.held.length - 1,
            'settle-any': Math.floor(next() * fake.held.length),
          }[op];
          const [done] = fake.held.splice(at, 1);
          if (done) yield* Deferred.succeed(done, undefined);
          for (let turn = 0; turn < 8; turn++) yield* Effect.yieldNow;
          break;
        }
      }
      const where = `seed ${seed}: ${trail.join(' ')}`;
      expect((yield* live.voice.view).enabled, where).toBe(expected);
    }
    const where = `seed ${seed}: ${trail.join(' ')}`;
    fake.free.on = true;
    for (const done of fake.held.splice(0)) yield* Deferred.succeed(done, undefined);
    for (const fiber of fibers) yield* Fiber.join(fiber);
    expect((yield* live.voice.view).enabled, where).toBe(expected);
    expect(backing.get(ENABLED_KEY), where).toBe(
      trail.some((op) => op === 'on' || op === 'off') ? String(expected) : stored,
    );
    yield* Scope.close(live.scope, Exit.void);
    const restarted = yield* start(deps);
    expect((yield* restarted.voice.view).enabled, where).toBe(expected);
    yield* Scope.close(restarted.scope, Exit.void);
  });

describe('the off switch in command order', () => {
  it('stores and restarts with the last switch call over 300 histories of held stops', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        for (let seed = 1; seed <= 300; seed++) yield* runHistory(seed);
      }),
    ));

  it('keeps a later on over an off whose stop is still pending, after its stop and a restart', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const backing = new Map<string, string>();
        const fake = heldSource();
        const deps = Layer.mergeAll(
          Layer.succeed(VoiceSource, fake.source),
          Layer.succeed(KeyValueStore.KeyValueStore, memoryStore(backing, false)),
        );
        const live = yield* start(deps);
        yield* live.voice.read('one two');
        const off = yield* launch(live.voice.setEnabled(false), fake.held);
        expect(fake.held).toHaveLength(1);
        expect((yield* live.voice.view).enabled).toBe(false);
        yield* live.voice.setEnabled(true);
        expect((yield* live.voice.view).enabled).toBe(true);
        fake.free.on = true;
        for (const done of fake.held.splice(0)) yield* Deferred.succeed(done, undefined);
        yield* Fiber.join(off);
        expect((yield* live.voice.view).enabled).toBe(true);
        expect(backing.get(ENABLED_KEY)).toBe('true');
        yield* Scope.close(live.scope, Exit.void);
        const restarted = yield* start(deps);
        expect((yield* restarted.voice.view).enabled).toBe(true);
        yield* Scope.close(restarted.scope, Exit.void);
      }),
    ));

  it('keeps a later on over an off whose stop is an already-resolved promise', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const backing = new Map<string, string>();
          const source = VoiceSource.of({
            voices: Effect.succeed([]),
            speak: () => Effect.void,
            pause: Effect.void,
            resume: Effect.void,
            // oxlint-disable-next-line effect/noNewPromise -- the iOS adapter's stop is a native promise; this case holds the service to one that has already settled
            stop: Effect.promise(() => Promise.resolve()),
            subscribe: () => Effect.void,
          });
          const deps = Layer.mergeAll(
            Layer.succeed(VoiceSource, source),
            Layer.succeed(KeyValueStore.KeyValueStore, memoryStore(backing, false)),
          );
          const runtime = yield* Effect.acquireRelease(
            Effect.sync(() => ManagedRuntime.make(Layer.provide(layer, deps))),
            (made) => Effect.promise(() => made.dispose()),
          );
          const voice = yield* Effect.promise(() => runtime.runPromise(Voice));
          yield* Effect.promise(() => runtime.runPromise(voice.read('one two')));
          const off = runtime.runPromise(voice.setEnabled(false));
          const on = runtime.runPromise(voice.setEnabled(true));
          yield* Effect.promise(() => off);
          yield* Effect.promise(() => on);
          expect((yield* Effect.promise(() => runtime.runPromise(voice.view))).enabled).toBe(true);
          expect(backing.get(ENABLED_KEY)).toBe('true');
        }),
      ),
    ));
});
