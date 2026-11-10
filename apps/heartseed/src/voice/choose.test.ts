/* oxlint-disable effect/noNullish, effect/noTernary -- the harness reads a missing store key as undefined, as the store answers it, and settles its held stops with no value; the generator's choices are plain branches. */

/**
 * The voice's choice in command order: whatever order the source's stops
 * settle in, the stored choice and a restart follow the last `choose` call
 * whose write landed, and the view follows each call at once; over a store
 * that writes at once, the choice is stored before any stop settles, and a
 * refused write leaves the store at the last landed choice. Off from a
 * reading under way stops it; Her and Him leave it going. Each stop is held
 * on a Deferred at the `VoiceSource` seam and released in a generated order,
 * while newer reads, stops, taps and picks run past it. The old switch's key
 * is seeded and never written.
 */

import { describe, expect, it } from 'bun:test';
import { Context, Deferred, Effect, Exit, Fiber, Layer, ManagedRuntime, Scope } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';

import { clockOf, START } from '../test/clock';
import {
  CHOICE_KEY,
  CHOICES,
  ENABLED_KEY,
  layer,
  nextChoice,
  Voice,
  VoiceSource,
  type Choice,
} from '../voice';

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

type Op = 'read' | 'tap' | 'pick' | 'stop' | 'settle-oldest' | 'settle-newest' | 'settle-any';

const OPS: ReadonlyArray<Op> = [
  'read',
  'read',
  'tap',
  'tap',
  'pick',
  'pick',
  'stop',
  'settle-oldest',
  'settle-newest',
  'settle-any',
];

/** The expected choice for a stored pair of texts, written out from the spec's read rule. */
const expectedAt = (choiceText: string | undefined, oldText: string | undefined): Choice => {
  if (choiceText === 'off' || choiceText === 'her' || choiceText === 'him') return choiceText;
  if (oldText === 'false') return 'off';
  return 'her';
};

/** A store over a map whose writes, in the `slow` form, yield before they land, and that refuses a write while `refuse.next` is set; it logs each write's key. */
const memoryStore = (backing: Map<string, string>, slow: boolean) => {
  const refuse = { next: false };
  const written: string[] = [];
  const store = KeyValueStore.makeStringOnly({
    get: (key) => Effect.sync(() => backing.get(key)),
    set: (key, value) => {
      written.push(key);
      if (refuse.next) {
        refuse.next = false;
        return Effect.fail(
          new KeyValueStore.KeyValueStoreError({ method: 'set', key, message: 'refused' }),
        );
      }
      const write = Effect.sync(() => void backing.set(key, value));
      if (slow) return Effect.andThen(Effect.yieldNow, write);
      return write;
    },
    remove: (key) => Effect.sync(() => void written.push(`remove ${key}`)),
    clear: Effect.sync(() => void written.push('clear')),
    size: Effect.sync(() => backing.size),
    keys: Effect.sync(() => Array.from(backing.keys())),
  });
  return { store, refuse, written };
};

/** A source whose every stop waits on a Deferred the test releases, until `free` lets later stops through; it counts its stops. */
const heldSource = () => {
  const held: Array<Deferred.Deferred<void>> = [];
  const free = { on: false };
  const stops = { count: 0 };
  const source = VoiceSource.of({
    voices: Effect.succeed([]),
    speak: () => Effect.void,
    pause: Effect.void,
    resume: Effect.void,
    stop: Effect.suspend(() => {
      stops.count += 1;
      if (free.on) return Effect.void;
      const done = Deferred.makeUnsafe<void>();
      held.push(done);
      return Deferred.await(done);
    }),
    subscribe: () => Effect.void,
  });
  return { held, free, stops, source };
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

const CHOICE_TEXTS = [undefined, 'off', 'her', 'him', 'Off', 'her ', 'true', '"him"'];

const OLD_TEXTS = [undefined, 'true', 'false', 'False'];

/** The reference a history runs against: the choice the view must hold, the last choice whose write landed, whether a reading is under way, and the stops the source must have seen. */
interface Expected {
  choice: Choice;
  landed: string | undefined;
  active: boolean;
  stops: number;
}

/** One history's harness: the service, its held source and store, the reference, and the fibers and trail so far. */
interface History {
  readonly next: () => number;
  readonly slow: boolean;
  readonly voice: Effect.Success<ReturnType<typeof start>>['voice'];
  readonly fake: ReturnType<typeof heldSource>;
  readonly kv: ReturnType<typeof memoryStore>;
  readonly want: Expected;
  readonly fibers: Array<Fiber.Fiber<void>>;
  readonly trail: string[];
}

/** A tap (the reference's own next choice) or a pick of any choice, refused by the store one time in seven over prompt writes. */
const chooseOp = (h: History, op: 'tap' | 'pick') =>
  Effect.gen(function* () {
    const choice = op === 'tap' ? nextChoice(h.want.choice) : pickOf(h.next, CHOICES);
    const refused = !h.slow && h.next() < 0.15;
    h.trail.push(`${op}:${choice}${refused ? ':refused' : ''}`);
    if (choice === 'off' && h.want.active) h.want.stops += 1;
    if (choice === 'off') h.want.active = false;
    h.want.choice = choice;
    if (!refused) h.want.landed = choice;
    h.kv.refuse.next = refused;
    h.fibers.push(yield* launch(h.voice.choose(choice), h.fake.held));
  });

/** Lets one held stop go: the oldest, the newest or any. */
const settleOp = (h: History, op: 'settle-oldest' | 'settle-newest' | 'settle-any') =>
  Effect.gen(function* () {
    h.trail.push(op);
    if (h.fake.held.length === 0) return;
    const at = {
      'settle-oldest': 0,
      'settle-newest': h.fake.held.length - 1,
      'settle-any': Math.floor(h.next() * h.fake.held.length),
    }[op];
    const [done] = h.fake.held.splice(at, 1);
    if (done) yield* Deferred.succeed(done, undefined);
    for (let turn = 0; turn < 8; turn++) yield* Effect.yieldNow;
  });

const applyOp = (h: History, op: Op) =>
  Effect.gen(function* () {
    if (op === 'read') {
      h.trail.push(op);
      if (h.want.choice !== 'off') h.want.active = true;
      h.fibers.push(yield* launch(h.voice.read(VERSE), h.fake.held));
      return;
    }
    if (op === 'stop') {
      h.trail.push(op);
      if (h.want.active) h.want.stops += 1;
      h.want.active = false;
      h.fibers.push(yield* launch(h.voice.stop, h.fake.held));
      return;
    }
    if (op === 'tap' || op === 'pick') return yield* chooseOp(h, op);
    yield* settleOp(h, op);
  });

/** The view, the source's stops and, over prompt writes, the stored choice held to the reference. */
const check = (h: History, backing: ReadonlyMap<string, string>, where: string) =>
  Effect.gen(function* () {
    const view = yield* h.voice.view;
    expect(view.choice, where).toBe(h.want.choice);
    expect(view.enabled, where).toBe(h.want.choice !== 'off');
    expect(view.status !== 'idle', where).toBe(h.want.active);
    expect(h.fake.stops.count, where).toBe(h.want.stops);
    if (!h.slow)
      expect(backing.get(CHOICE_KEY), `${where} (stored before the stops settle)`).toBe(
        h.want.landed,
      );
  });

const runHistory = (seed: number) =>
  Effect.gen(function* () {
    const next = random(seed);
    const choiceText = pickOf(next, CHOICE_TEXTS);
    const oldText = pickOf(next, OLD_TEXTS);
    const slow = next() < 0.4;
    const backing = new Map<string, string>();
    if (choiceText !== undefined) backing.set(CHOICE_KEY, choiceText);
    if (oldText !== undefined) backing.set(ENABLED_KEY, oldText);
    const fake = heldSource();
    const kv = memoryStore(backing, slow);
    const deps = Layer.mergeAll(
      Layer.succeed(VoiceSource, fake.source),
      Layer.succeed(KeyValueStore.KeyValueStore, kv.store),
    );
    const live = yield* start(deps);
    const h: History = {
      next,
      slow,
      voice: live.voice,
      fake,
      kv,
      want: {
        choice: expectedAt(choiceText, oldText),
        landed: choiceText,
        active: false,
        stops: 0,
      },
      fibers: [],
      trail: [`stored=${String(choiceText)},${String(oldText)} slow=${slow}`],
    };
    yield* check(h, backing, h.trail.join(' '));
    for (let i = 0; i < 16; i++) {
      yield* applyOp(h, pickOf(next, OPS));
      yield* check(h, backing, `seed ${seed}: ${h.trail.join(' ')}`);
    }
    const { fibers } = h;
    const expected = h.want.choice;
    const landed = h.want.landed;
    const where = `seed ${seed}: ${h.trail.join(' ')}`;
    fake.free.on = true;
    for (const done of fake.held.splice(0)) yield* Deferred.succeed(done, undefined);
    for (const fiber of fibers) yield* Fiber.join(fiber);
    expect((yield* live.voice.view).choice, where).toBe(expected);
    expect(backing.get(CHOICE_KEY), where).toBe(landed);
    expect(backing.get(ENABLED_KEY), where).toBe(oldText);
    expect(new Set(kv.written).size <= 1, where).toBe(true);
    if (kv.written.length > 0) expect(kv.written[0], where).toBe(CHOICE_KEY);
    yield* Scope.close(live.scope, Exit.void);
    const restarted = yield* start(deps);
    expect((yield* restarted.voice.view).choice, where).toBe(expectedAt(landed, oldText));
    yield* Scope.close(restarted.scope, Exit.void);
  });

describe('the choice in command order', () => {
  it('stores and restarts with the last landed choice over 300 histories of held stops', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        for (let seed = 1; seed <= 300; seed++) yield* runHistory(seed);
      }).pipe(Effect.provide(clockOf({ now: START }))),
    ));

  it('keeps a later Her over an Off whose stop is still pending, after its stop and a restart', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const backing = new Map<string, string>([[ENABLED_KEY, 'false']]);
        const fake = heldSource();
        const kv = memoryStore(backing, false);
        const deps = Layer.mergeAll(
          Layer.succeed(VoiceSource, fake.source),
          Layer.succeed(KeyValueStore.KeyValueStore, kv.store),
        );
        const live = yield* start(deps);
        expect((yield* live.voice.view).choice).toBe('off');
        yield* live.voice.choose('him');
        yield* live.voice.read('one two');
        const off = yield* launch(live.voice.choose('off'), fake.held);
        expect(fake.held).toHaveLength(1);
        expect(yield* live.voice.view).toMatchObject({ choice: 'off', ended: 'off' });
        yield* live.voice.choose('her');
        expect((yield* live.voice.view).choice).toBe('her');
        fake.free.on = true;
        for (const done of fake.held.splice(0)) yield* Deferred.succeed(done, undefined);
        yield* Fiber.join(off);
        expect((yield* live.voice.view).choice).toBe('her');
        expect(backing.get(CHOICE_KEY)).toBe('her');
        expect(backing.get(ENABLED_KEY)).toBe('false');
        yield* Scope.close(live.scope, Exit.void);
        const restarted = yield* start(deps);
        expect((yield* restarted.voice.view).choice).toBe('her');
        yield* Scope.close(restarted.scope, Exit.void);
      }),
    ));

  it('keeps a later Her over an Off whose stop is an already-resolved promise', () =>
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
            Layer.succeed(KeyValueStore.KeyValueStore, memoryStore(backing, false).store),
          );
          const runtime = yield* Effect.acquireRelease(
            Effect.sync(() => ManagedRuntime.make(Layer.provide(layer, deps))),
            (made) => Effect.promise(() => made.dispose()),
          );
          const voice = yield* Effect.promise(() => runtime.runPromise(Voice));
          yield* Effect.promise(() => runtime.runPromise(voice.read('one two')));
          const off = runtime.runPromise(voice.choose('off'));
          const her = runtime.runPromise(voice.choose('her'));
          yield* Effect.promise(() => off);
          yield* Effect.promise(() => her);
          expect((yield* Effect.promise(() => runtime.runPromise(voice.view))).choice).toBe('her');
          expect(backing.get(CHOICE_KEY)).toBe('her');
          expect(backing.has(ENABLED_KEY)).toBe(false);
        }),
      ),
    ));
});
