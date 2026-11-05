/* oxlint-disable effect/noGlobals, effect/noNullish -- the store stand-in keeps its disk and its faults in plain maps and counters a case sets between steps; the dictation view gives an absent matcher as null. */

/**
 * Today's press over the app's own layer: the cue a recital is said under,
 * read from Say it's view and the matcher's suggestion, with a store in
 * memory that can refuse a write, hold one until released, or fail every
 * listing (an unread garden). The clock is a test clock, so the scripted
 * recital and the garden's retries wait on nothing real.
 *
 * It catches a press that cues its recital from a view a keep still in
 * flight is about to change (a grade changed to Again just before the
 * press), a cue that moves on a refused write, an unread garden that cues a
 * stage it never read, and a passage not planted said under anything but
 * the full text. It misses what the screen draws under the cue, which the
 * screen tests own.
 */

import { describe, expect, it } from 'bun:test';
import { Context, Deferred, Effect, Fiber, Layer, Logger, Option, Scope, Stream } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import * as TestClock from 'effect/testing/TestClock';
import passage from 'virtual:heartseed-passage';

import { appLayer, pressToday } from './app';
import { recite, scriptedSource } from './dictation/script';
import { Chime, Garden } from './garden';
import type { Cue } from './matcher';
import { Haptics, SayIt, type Recall } from './sayit';
import { DAY, keyOf } from './test/garden-model';
import { voiceSource } from './voice/source';

const START = Date.UTC(2026, 3, 1, 9);

/** A recall of `reference` at `startedAt`, said whole with Good. */
const recallAt = (startedAt: number, reference = passage.reference): Recall => ({
  reference,
  startedAt,
  grade: 3,
  suggested: 3,
  words: 37,
  missed: 0,
  peeked: 0,
  extra: 0,
});

/** What a case does to the store: listings to fail, writes to refuse, and a write to hold until its gate opens. */
interface Faults {
  keys: number;
  refuse: number;
  hold: Option.Option<Deferred.Deferred<void>>;
}

const failed = (method: string) =>
  new KeyValueStore.KeyValueStoreError({ message: method, method });

/** A store over `disk` that fails as `faults` say at the time of each call. */
const memory = (disk: Map<string, string>, faults: Faults) =>
  Layer.succeed(
    KeyValueStore.KeyValueStore,
    KeyValueStore.makeStringOnly({
      get: (key) => Effect.sync(() => disk.get(key)),
      set: (key, value) =>
        Effect.gen(function* () {
          if (faults.refuse > 0) {
            faults.refuse -= 1;
            return yield* failed('set');
          }
          const gate = faults.hold;
          faults.hold = Option.none();
          if (Option.isSome(gate)) yield* Deferred.await(gate.value);
          disk.set(key, value);
        }),
      remove: (key) => Effect.sync(() => void disk.delete(key)),
      clear: Effect.sync(() => disk.clear()),
      size: Effect.sync(() => disk.size),
      keys: Effect.suspend(() => {
        if (faults.keys === 0) return Effect.succeed([...disk.keys()]);
        faults.keys -= 1;
        return Effect.fail(failed('keys'));
      }),
    }),
  );

/** The app's services over a store holding `recalls`, a perfect recital played at a word a millisecond, read to its end on the test clock. */
const launch = (recalls: readonly Recall[], faults: Faults) =>
  Effect.gen(function* () {
    const disk = new Map(recalls.map((recall) => [keyOf(recall), JSON.stringify(recall)]));
    yield* TestClock.setTime(START + DAY);
    const scope = yield* Scope.make();
    const building = yield* Effect.forkChild(
      Layer.buildWithScope(
        appLayer({
          source: scriptedSource(recite(passage.text, { every: 5, pace: 1 })),
          haptics: Layer.succeed(Haptics, Haptics.of({ tick: Effect.void })),
          store: memory(disk, faults),
          chime: Layer.succeed(Chime, Chime.of({ grow: () => Effect.void })),
          voice: voiceSource,
        }),
        scope,
      ),
    );
    yield* TestClock.adjust('1 second');
    const services = yield* Fiber.join(building);
    const sayIt = Context.get(services, SayIt);
    /** Presses Say it, then plays the recital to its end and returns its cue and suggestion. */
    const say = Effect.gen(function* () {
      const pressing = yield* Effect.forkChild(Effect.provideContext(pressToday, services));
      yield* TestClock.adjust('1 second');
      yield* Fiber.join(pressing);
      yield* TestClock.adjust('1 second');
      const view = yield* sayIt.view;
      return { cue: view.cue, suggested: view.dictation.matcher?.suggestedGrade };
    });
    return { services, sayIt, garden: Context.get(services, Garden), disk, say };
  });

const run = <A, E>(effect: Effect.Effect<A, E, Scope.Scope>) =>
  Effect.runPromise(
    effect.pipe(Effect.scoped, Effect.provide(Layer.merge(Logger.layer([]), TestClock.layer()))),
  );

const none = (): Faults => ({ keys: 0, refuse: 0, hold: Option.none() });

const said = (cue: Cue, suggested: 1 | 2 | 3) => ({ cue, suggested });

describe('Today’s press', () => {
  it('says a passage not planted under the full text, then under its letters at a seed, then with nothing at a blade, each suggestion as the matcher gives it', () =>
    run(
      Effect.gen(function* () {
        const app = yield* launch([recallAt(START, 'Made 1:1')], none());
        expect(yield* app.say).toEqual(said('full', 2));
        expect(yield* app.say).toEqual(said('initials', 2));
        expect(yield* app.say).toEqual(said('none', 3));
        expect(yield* app.say).toEqual(said('none', 3));
      }),
    ));

  it('says it after a grade changed to Again whose write is held: under letters once the write lands, never the stale nothing', () =>
    run(
      Effect.gen(function* () {
        const faults = none();
        const app = yield* launch([recallAt(START - DAY)], faults);
        expect(yield* app.say).toEqual(said('initials', 2));
        expect(yield* app.say).toEqual(said('none', 3));
        const gate = yield* Deferred.make<void>();
        faults.hold = Option.some(gate);
        const before = yield* app.sayIt.view;
        const choosing = yield* Effect.forkChild(app.sayIt.choose(1));
        const pressing = yield* Effect.forkChild(Effect.provideContext(pressToday, app.services));
        yield* TestClock.adjust('1 second');
        const held = yield* app.sayIt.view;
        expect([held.startedAt === before.startedAt, held.cue]).toEqual([true, 'none']);
        yield* Deferred.succeed(gate, undefined);
        yield* Fiber.join(choosing);
        yield* Fiber.join(pressing);
        yield* TestClock.adjust('1 second');
        const view = yield* app.sayIt.view;
        expect([
          view.startedAt === before.startedAt,
          view.cue,
          view.dictation.matcher?.suggestedGrade,
        ]).toEqual([false, 'initials', 2]);
      }),
    ));

  it('keeps the cue where a refused write left it: still letters at a seed, and the next recital under them grows a blade', () =>
    run(
      Effect.gen(function* () {
        const faults = none();
        const app = yield* launch([recallAt(START)], faults);
        faults.refuse = 1;
        expect(yield* app.say).toEqual(said('initials', 2));
        expect(app.disk.size).toBe(1);
        expect(yield* app.say).toEqual(said('initials', 2));
        expect(app.disk.size).toBe(2);
        expect(yield* app.say).toEqual(said('none', 3));
      }),
    ));

  it('says it with nothing in an unread garden, a perfect recital suggested Good, and writes it all the same', () =>
    run(
      Effect.gen(function* () {
        const app = yield* launch([recallAt(START)], { ...none(), keys: 3 });
        expect((yield* app.garden.view)._tag).toBe('Unread');
        expect(yield* app.say).toEqual(said('none', 3));
        expect(app.disk.size).toBe(2);
        expect(yield* Stream.runHead(app.garden.changes)).toEqual(Option.some({ _tag: 'Unread' }));
      }),
    ));
});
