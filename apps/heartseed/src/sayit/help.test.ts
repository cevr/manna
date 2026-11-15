/* oxlint-disable effect/noNullish, effect/noGlobals -- the store stand-in keeps its disk in a plain map of JSON text whose absent values are undefined, and the case reads it back as the garden wrote it. */

/**
 * Help taken on Today at rest, before a verse's try, over the app's own
 * layer, a store in memory and a test clock, each recital a perfect one
 * played to its end: a peek at a word (`reveal`) caps the try at Hard, the
 * suggestion taken and every grade chosen, and counts the word peeked;
 * `Show all` moves the verse back a stage through Move back's own step back
 * (`Backs.back`), written at `Next` at the instant of the `Show all`, before
 * the try, and caps the try so the stage rule leaves the verse on the stage
 * below (Again from a blade and at a seed, Hard from an ear). Leaving before
 * `Next` (`leaveToday`) writes nothing and lets the help go.
 *
 * It catches a peek or a `Show all` that leaves the try's grade free, a
 * grade above the cap taken by a tap, a step back written before `Next`,
 * after the try (where it would fold after the recall), or not at all, a
 * cap that lets the try grow the verse straight back, and help that
 * outlives a leave. It misses what Today draws, which
 * `src/garden/peek-today.test.tsx` owns.
 */

import { describe, expect, it } from 'bun:test';
import { Clock, Context, Effect, Fiber, Layer, Logger, Option, Scope } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import * as TestClock from 'effect/testing/TestClock';
import passage from 'virtual:heartseed-passage';

import { appLayer, leaveToday, nextItem, pressToday, showAllToday } from '../app';
import { recite, scriptedSource } from '../dictation/script';
import { Chime, Garden, stageOf } from '../garden';
import { sourceWords } from '../matcher/words';
import { Haptics, SayIt, type Recall } from '../sayit';
import type { Item } from '../session';
import { DAY, keyOf, MINUTE } from '../test/garden-model';
import { voiceSource } from '../voice/source';

const START = Date.UTC(2026, 3, 1, 9);

/** A recall of the passage at `startedAt`, said whole with Good. */
const good = (startedAt: number): Recall => ({
  reference: passage.reference,
  startedAt,
  offset: 0,
  grade: 3,
  suggested: 3,
  words: 10,
  missed: 0,
  peeked: 0,
  extra: 0,
});

/** The passage's history at each stage: one Good a seed, two a blade, three an ear. */
const HISTORIES = {
  seed: [good(START - 3 * DAY)],
  blade: [good(START - 3 * DAY), good(START - 2 * DAY)],
  ear: [good(START - 3 * DAY), good(START - 2 * DAY), good(START - 2 * DAY + 10 * MINUTE)],
} as const;

/** The run's item of the passage, as Today holds it at a press. */
const ITEM: Item = { reference: passage.reference, fresh: false, recalls: 1, seconds: 30 };

const WORDS = sourceWords(passage.text).length;

/** A store over `disk` that never fails. */
const memory = (disk: Map<string, string>) =>
  Layer.succeed(
    KeyValueStore.KeyValueStore,
    KeyValueStore.makeStringOnly({
      get: (key) => Effect.sync(() => disk.get(key)),
      set: (key, value) => Effect.sync(() => void disk.set(key, value)),
      remove: (key) => Effect.sync(() => void disk.delete(key)),
      clear: Effect.sync(() => disk.clear()),
      size: Effect.sync(() => disk.size),
      keys: Effect.sync(() => [...disk.keys()]),
    }),
  );

/** The parsed values of the records on `disk` under `heartseed/<kind>/`, in key order. */
const parsedOn = (disk: Map<string, string>, kind: 'recall' | 'back') =>
  [...disk.keys()]
    .filter((key) => key.startsWith(`heartseed/${kind}/`))
    .sort()
    .map((key) => JSON.parse(disk.get(key) ?? '{}'));

/** The recalls on `disk`, in key order. */
const recallsOn = (disk: Map<string, string>): readonly Recall[] => parsedOn(disk, 'recall');

/** The steps back on `disk`, in key order. */
const backsOn = (disk: Map<string, string>): readonly { reference: string; at: number }[] =>
  parsedOn(disk, 'back');

/** The app's services over the passage at `stage`, a month on, its recitals perfect at a word a millisecond. */
const launch = (stage: keyof typeof HISTORIES) =>
  Effect.gen(function* () {
    const disk = new Map(
      HISTORIES[stage].map((recall) => [keyOf(recall), JSON.stringify(recall)] as const),
    );
    yield* TestClock.setTime(START + 30 * DAY);
    const scope = yield* Scope.make();
    const building = yield* Effect.forkChild(
      Layer.buildWithScope(
        appLayer({
          source: scriptedSource(recite(passage.text, { every: 5, pace: 1 })),
          haptics: Layer.succeed(Haptics, Haptics.of({ tick: Effect.void })),
          store: memory(disk),
          chime: Layer.succeed(Chime, Chime.of({ grow: () => Effect.void })),
          voice: voiceSource,
        }),
        scope,
      ),
    );
    yield* TestClock.adjust('1 second');
    const services = yield* Fiber.join(building);
    /** Runs one of Today's steps over the app's services, the test clock moved on until it ends. */
    const step = <A>(effect: Effect.Effect<A, never, Layer.Success<ReturnType<typeof appLayer>>>) =>
      Effect.gen(function* () {
        const running = yield* Effect.forkChild(Effect.provideContext(effect, services));
        yield* TestClock.adjust('1 second');
        const out = yield* Fiber.join(running);
        yield* TestClock.adjust('1 second');
        return out;
      });
    const garden = Context.get(services, Garden);
    return {
      sayIt: Context.get(services, SayIt),
      disk,
      say: step(pressToday(passage, Option.some(ITEM))),
      showAll: step(showAllToday(passage)),
      next: step(nextItem),
      leave: step(leaveToday),
      stage: Effect.map(garden.view, (view) => {
        if (view._tag === 'Unread') return Option.none();
        return Option.map(Option.fromNullishOr(view.plants.get(passage.reference)), stageOf);
      }),
    };
  });

const run = <A, E>(effect: Effect.Effect<A, E, Scope.Scope>) =>
  Effect.runPromise(
    effect.pipe(Effect.scoped, Effect.provide(Layer.merge(Logger.layer([]), TestClock.layer()))),
  );

describe('help taken before a try', () => {
  it('caps the try at Hard after a peek at a word: the suggestion taken and every grade chosen, the word counted peeked', () =>
    run(
      Effect.gen(function* () {
        const app = yield* launch('blade');
        yield* app.sayIt.reveal(passage.reference, 0);
        yield* app.sayIt.reveal(passage.reference, 0);
        yield* app.say;
        const finished = yield* app.sayIt.view;
        expect([finished.dictation.matcher?.suggestedGrade, finished.choice]).toEqual([3, 2]);
        yield* app.sayIt.choose(3);
        yield* app.sayIt.choose(4);
        expect((yield* app.sayIt.view).choice).toBe(2);
        yield* app.sayIt.choose(1);
        yield* app.sayIt.choose(2);
        expect(recallsOn(app.disk).length).toBe(2);
        yield* app.next;
        const kept = recallsOn(app.disk).at(-1);
        expect([kept?.grade, kept?.suggested, kept?.peeked]).toEqual([2, 3, 1]);
        expect([backsOn(app.disk), (yield* app.sayIt.view).help]).toEqual([[], undefined]);
      }),
    ));

  it('moves an ear back to a blade at Next after Show all: the step back at its instant, before the try, then the try at Hard with every word peeked', () =>
    run(
      Effect.gen(function* () {
        const app = yield* launch('ear');
        expect(yield* app.stage).toEqual(Option.some('ear'));
        const shownAt = yield* Clock.currentTimeMillis;
        yield* app.showAll;
        expect([(yield* app.sayIt.view).help?.shownAt, app.disk.size]).toEqual([shownAt, 3]);
        yield* app.say;
        const finished = yield* app.sayIt.view;
        expect([finished.cue, finished.choice]).toEqual(['none', 2]);
        expect([app.disk.size, yield* app.stage]).toEqual([3, Option.some('ear')]);
        yield* app.next;
        const backs = backsOn(app.disk);
        const kept = recallsOn(app.disk).at(-1);
        expect(backs).toEqual([{ reference: passage.reference, at: shownAt }]);
        expect([
          shownAt < (kept?.startedAt ?? 0),
          kept?.grade,
          kept?.peeked,
          yield* app.stage,
        ]).toEqual([true, 2, WORDS, Option.some('blade')]);
      }),
    ));

  it('moves a blade back to a seed after Show all: the try said under first letters and capped at Again', () =>
    run(
      Effect.gen(function* () {
        const app = yield* launch('blade');
        yield* app.showAll;
        yield* app.say;
        const finished = yield* app.sayIt.view;
        expect([finished.cue, finished.choice]).toEqual(['initials', 1]);
        yield* app.sayIt.choose(2);
        expect((yield* app.sayIt.view).choice).toBe(1);
        yield* app.next;
        expect([
          backsOn(app.disk).length,
          recallsOn(app.disk).at(-1)?.grade,
          yield* app.stage,
        ]).toEqual([1, 1, Option.some('seed')]);
      }),
    ));

  it('keeps a seed a seed after Show all: no step back below it, the try at Again', () =>
    run(
      Effect.gen(function* () {
        const app = yield* launch('seed');
        yield* app.showAll;
        yield* app.say;
        expect((yield* app.sayIt.view).choice).toBe(1);
        yield* app.next;
        expect([
          backsOn(app.disk).length,
          recallsOn(app.disk).at(-1)?.grade,
          yield* app.stage,
        ]).toEqual([0, 1, Option.some('seed')]);
      }),
    ));

  it('records nothing when Today is left after a peek and Show all, and lets the help go: the next try is free', () =>
    run(
      Effect.gen(function* () {
        const app = yield* launch('ear');
        const before = [...app.disk.entries()];
        yield* app.sayIt.reveal(passage.reference, 1);
        yield* app.showAll;
        yield* app.say;
        expect((yield* app.sayIt.view).choice).toBe(2);
        yield* app.leave;
        expect([[...app.disk.entries()], (yield* app.sayIt.view).help, yield* app.stage]).toEqual([
          before,
          undefined,
          Option.some('ear'),
        ]);
        yield* app.say;
        expect((yield* app.sayIt.view).choice).toBe(3);
        yield* app.next;
        expect([backsOn(app.disk).length, recallsOn(app.disk).at(-1)?.peeked]).toEqual([0, 0]);
      }),
    ));
});
