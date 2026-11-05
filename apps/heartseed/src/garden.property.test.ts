/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary -- the property drives generated launches step by step over the device stand-in's plain maps, and compares the garden's Option-built views with a model written over undefined. */

/**
 * The garden over the app's real store on the device's `One.Database`
 * stand-in. Its seams: the rules (`plantOf`, `stageOf`, `growthOf`) against
 * ts-fsrs and the spec's rules written plainly (`test/garden-model.ts`); and
 * the Garden and `Recalls` services across launches, where the store can fail
 * at its open, its listing, any record's read or a write.
 *
 * It catches a garden that certifies a history from a read that did not
 * complete (an open, a listing or a record read that failed), reads past
 * three attempts or again after it gave up, publishes or sounds ahead of a
 * write, sounds when unread, stores anything but the recall's own record,
 * or loads a record under another recital's key. It misses what the device
 * does with a write after it took it, and the read's real waits (the clock
 * here is a test clock).
 */

import { describe, expect, it } from 'bun:test';
import {
  Array as Arr,
  Context,
  Effect,
  Fiber,
  Layer,
  Logger,
  Option,
  References,
  Stream,
} from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import * as TestClock from 'effect/testing/TestClock';

import {
  Chime,
  Garden,
  growthOf,
  layer,
  plantOf,
  stageOf,
  STAGES,
  type GardenView,
  type Growth,
} from './garden';
import { Recalls, type Recall } from './sayit';
import { store } from './store';
import {
  below,
  DAY,
  GardenModel,
  growthRule,
  keyOf,
  MINUTE,
  pickOf,
  random,
  referenceCard,
  referenceStage,
} from './test/garden-model';
import { device } from './test/one';

const REFERENCES = ['Made 1:1', 'Made 1:10', 'Made 2:3'] as const;

/** A recall a reader could leave: a grade as readers give them, sometimes a peek. */
const recallOf = (next: () => number, reference: string, startedAt: number): Recall => {
  const grade = pickOf(next, [1, 2, 3, 3, 3, 4] as const);
  const peeked = next() < 0.25 ? 1 : 0;
  return {
    reference,
    startedAt,
    grade,
    suggested: grade === 4 ? 3 : grade,
    words: 20,
    missed: peeked + below(next, 2),
    peeked,
    extra: below(next, 2),
  };
};

describe('the stage rule over ts-fsrs', () => {
  it('folds 400 generated verses in time order to ts-fsrs’s card, and stages and grows them as the rule says', () => {
    const reached = new Set<string>();
    let grown = 0;
    for (let seed = 1; seed <= 400; seed += 1) {
      const next = random(seed * 13);
      let at = Date.UTC(2026, 0, 1) + below(next, DAY);
      const recalls = Array.from({ length: 1 + below(next, 10) }, () => {
        at += next() < 0.3 ? (1 + below(next, 20)) * MINUTE : (1 + below(next, 30)) * DAY;
        return recallOf(next, 'Made 1:1', at);
      });
      const shuffled = recalls.toSorted(() => next() - 0.5);
      if (!Arr.isReadonlyArrayNonEmpty(shuffled)) continue;
      const plant = plantOf(shuffled);
      expect({ seed, recalls: [...plant.recalls], card: plant.card }).toEqual({
        seed,
        recalls,
        card: referenceCard(recalls),
      });
      expect({ seed, stage: stageOf(plant) }).toEqual({ seed, stage: referenceStage(recalls) });
      reached.add(stageOf(plant));
      for (const recall of recalls) {
        const growth = growthRule(recalls, recall.startedAt);
        expect({ seed, growth: Option.getOrUndefined(growthOf(plant, recall.startedAt)) }).toEqual({
          seed,
          growth: growth === undefined ? undefined : { from: growth.from, to: growth.to },
        });
        if (growth !== undefined) grown += 1;
      }
    }
    expect([...reached].toSorted()).toEqual([...STAGES].toSorted());
    expect(grown).toBeGreaterThan(100);
  });

  it('is full corn from a stability of exactly 21 days, and below it as the rest of the rule says', () => {
    const recall: Recall = {
      reference: 'Made 1:1',
      startedAt: 0,
      grade: 3,
      suggested: 3,
      words: 9,
      missed: 0,
      peeked: 1,
      extra: 0,
    };
    const plant = plantOf([recall, { ...recall, startedAt: DAY }]);
    expect(stageOf({ ...plant, card: { ...plant.card, stability: 21 } })).toBe('full corn');
    expect(stageOf({ ...plant, card: { ...plant.card, stability: 21 - 1e-8 } })).toBe('blade');
    expect(stageOf(plantOf([{ ...recall, peeked: 0 }]))).toBe('seed');
    expect(stageOf(plantOf([recall, { ...recall, startedAt: DAY, grade: 1, peeked: 0 }]))).toBe(
      'seed',
    );
    expect(stageOf(plantOf([recall, { ...recall, startedAt: DAY, peeked: 0, missed: 2 }]))).toBe(
      'ear',
    );
  });
});

interface Log {
  readonly message: string;
  readonly key: unknown;
}

/** A logger that records each message and its `key` annotation, and prints nothing. */
const recording = (logs: Log[]) =>
  Logger.layer([
    Logger.make((options) =>
      logs.push({
        message: [options.message].flat().map(String).join(' '),
        key: options.fiber.getRef(References.CurrentLogAnnotations)['key'],
      }),
    ),
  ]);

/** Runs a test's effect on a test clock, its logs recorded nowhere, so the run prints nothing and waits on no real time. */
const quietly = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.runPromise(effect.pipe(Effect.provide(Layer.merge(recording([]), TestClock.layer()))));

/** A recording chime. */
const chimeInto = (chimes: Growth[]) =>
  Layer.succeed(Chime, Chime.of({ grow: (growth) => Effect.sync(() => void chimes.push(growth)) }));

/** One launch: the real store opened anew on the device and the garden built over it in the current scope, its read run to its end (the test clock moved past its waits). */
const launch = (chimes: Growth[], logs: Log[]) =>
  Effect.gen(function* () {
    const built = Layer.build(
      layer.pipe(
        Layer.provide(Layer.mergeAll(Layer.fresh(store), chimeInto(chimes))),
        Layer.provide(recording(logs)),
      ),
    );
    const reading = yield* Effect.forkChild(built);
    yield* TestClock.adjust('1 second');
    const services = yield* Fiber.join(reading);
    return { garden: Context.get(services, Garden), recalls: Context.get(services, Recalls) };
  });

type Knows = 'Unread' | ReadonlyArray<readonly [string, ReadonlyArray<Recall>]>;

const byReference = (
  a: readonly [string, ReadonlyArray<Recall>],
  b: readonly [string, ReadonlyArray<Recall>],
) => a[0].localeCompare(b[0]);

/** What a view knows: `Unread`, or each plant's reference and recalls. */
const known = (view: GardenView): Knows =>
  view._tag === 'Unread'
    ? 'Unread'
    : [...view.plants.values()]
        .map((plant): readonly [string, ReadonlyArray<Recall>] => [plant.reference, plant.recalls])
        .toSorted(byReference);

const modelKnows = (model: GardenModel): Knows =>
  model.read
    ? model
        .references()
        .map((reference): readonly [string, ReadonlyArray<Recall>] => [
          reference,
          model.recallsOf(reference),
        ])
        .toSorted(byReference)
    : 'Unread';

const recallKeysOn = () =>
  [...device.disk.keys()].filter((key) => key.startsWith('heartseed/recall/'));

/** A generated device: each reference's valid history, sometimes one value under the prefix that is no recall of its key, and a setting, in a shuffled order. */
const seedDevice = (next: () => number) => {
  const model = new GardenModel();
  const clock = { now: Date.UTC(2026, 2, 1) + below(next, DAY) };
  const disk: [string, string | null][] = [];
  const bad: string[] = [];
  for (const reference of REFERENCES)
    for (let i = below(next, 4); i > 0; i -= 1) {
      clock.now += (1 + below(next, 9)) * DAY;
      const recall = recallOf(next, reference, clock.now);
      disk.push([keyOf(recall), JSON.stringify(recall)]);
      model.records.set(keyOf(recall), recall);
    }
  if (next() < 0.5) {
    const key = `heartseed/recall/Made 1:1/${clock.now + 3}`;
    disk.push([
      key,
      pickOf(next, [null, 'not json', JSON.stringify(recallOf(next, 'Made 1:10', clock.now + 3))]),
    ]);
    bad.push(key);
  }
  disk.push(['heartseed/voice/enabled', 'false']);
  device.launch(disk.toSorted(() => next() - 0.5));
  return { model, clock, bad };
};

type Fault = 'none' | 'open' | 'keys' | 'get';

/** A launch's read script: healthy, or failing at the open, the listing or the first record read 1-4 times; the read completes when fewer than three attempts fail. */
const scriptOf = (next: () => number) => {
  const fault = pickOf(next, [
    'none',
    'none',
    'open',
    'keys',
    'get',
  ] as const satisfies readonly Fault[]);
  const failures = fault === 'none' ? 0 : 1 + below(next, 4);
  const read = fault === 'get' && recallKeysOn().length === 0 ? true : failures < 3;
  return { fault, failures, read };
};

/** The recall of a step: the current recital's peek or grade change, or a new recital. */
const recallAfter = (next: () => number, current: Recall | undefined, clock: { now: number }) => {
  if (current !== undefined && next() < 0.35)
    return next() < 0.5
      ? { ...current, peeked: current.peeked + 1, missed: current.missed + 1 }
      : { ...current, grade: pickOf(next, [1, 2, 3, 4] as const) };
  clock.now += next() < 0.3 ? (1 + below(next, 20)) * MINUTE : (1 + below(next, 20)) * DAY;
  return recallOf(next, pickOf(next, REFERENCES), clock.now);
};

/** After a step: the view, the chimes and every record on the device as the model says. */
const checkStep = (
  garden: Garden['Service'],
  model: GardenModel,
  chimes: Growth[],
  bad: readonly string[],
  at: Readonly<Record<string, string | number>>,
) =>
  Effect.gen(function* () {
    expect({ ...at, knows: known(yield* garden.view) }).toEqual({
      ...at,
      knows: modelKnows(model),
    });
    expect({ ...at, chimes }).toEqual({ ...at, chimes: model.chimes });
    expect({
      ...at,
      records: recallKeysOn()
        .filter((key) => !bad.includes(key))
        .toSorted(),
    }).toEqual({
      ...at,
      records: [...model.records.keys()].toSorted(),
    });
    for (const [key, recall] of model.records)
      expect({ ...at, key, record: JSON.parse(device.disk.get(key) ?? '{}') }).toEqual({
        ...at,
        key,
        record: { ...recall },
      });
  });

describe('the garden over the device', () => {
  it('certifies a history only from a completed read, and extends it only by writes the device took, over 80 generated devices', () =>
    quietly(
      Effect.gen(function* () {
        const cover = new Map<string, number>();
        const bump = (key: string) => cover.set(key, (cover.get(key) ?? 0) + 1);
        for (let seed = 1; seed <= 80; seed += 1) {
          const next = random(seed * 7919);
          const { model, clock, bad } = seedDevice(next);
          const chimes: Growth[] = [];
          for (let l = 0, launches = 1 + below(next, 3); l < launches; l += 1) {
            const { fault, failures, read } = scriptOf(next);
            device.launch(device.disk);
            if (fault !== 'none') device.fail(fault, failures);
            model.restart(read);
            const logs: Log[] = [];
            const knowing = read ? 'Read' : 'Unread';
            const at = { seed, l, fault, failures };
            yield* Effect.scoped(
              Effect.gen(function* () {
                const { garden, recalls } = yield* launch(chimes, logs);
                const listings = device.calls.keys;
                bump(`${knowing}:${fault}`);
                yield* checkStep(garden, model, chimes, bad, at);
                if (read)
                  expect({
                    ...at,
                    skipped: logs
                      .filter((x) => x.message === 'garden.record.skipped')
                      .map((x) => x.key),
                  }).toEqual({ ...at, skipped: bad });
                let current: Recall | undefined;
                for (let step = 0, steps = below(next, 7); step < steps; step += 1) {
                  const mode = pickOf(next, ['ok', 'ok', 'ok', 'set', 'down'] as const);
                  device.failing = {
                    open: mode === 'down' ? 99 : 0,
                    keys: 0,
                    get: 0,
                    set: mode === 'ok' ? 0 : 99,
                  };
                  current = recallAfter(next, current, clock);
                  const burst =
                    next() < 0.2
                      ? [current, { ...current, grade: 1 as const }, current]
                      : [current];
                  yield* Effect.forEach(burst, (recall) => recalls.keep(recall), {
                    concurrency: 3,
                  });
                  for (const recall of burst) model.keep(recall, mode === 'ok');
                  bump(`${knowing}:${mode}`);
                  yield* checkStep(garden, model, chimes, bad, { ...at, step, mode });
                }
                const latest = yield* Stream.runHead(garden.changes);
                expect({ ...at, latest: Option.map(latest, known) }).toEqual({
                  ...at,
                  latest: Option.some(known(yield* garden.view)),
                });
                expect({
                  ...at,
                  listings: device.calls.keys,
                  remove: device.calls.remove,
                  clear: device.calls.clear,
                }).toEqual({ ...at, listings, remove: 0, clear: 0 });
              }),
            );
          }
        }
        for (const key of [
          'Read:none',
          'Read:open',
          'Read:keys',
          'Read:get',
          'Unread:open',
          'Unread:keys',
          'Unread:get',
          'Read:ok',
          'Read:set',
          'Read:down',
          'Unread:ok',
          'Unread:set',
          'Unread:down',
        ])
          expect({ key, covered: (cover.get(key) ?? 0) >= 3 }).toEqual({ key, covered: true });
      }),
    ));

  it('reads no empty garden when the open fails each time: a keep while the device is down lands nothing, one once it opens lands silently, and the next launch reads the disk', () =>
    quietly(
      Effect.gen(function* () {
        const planted: Recall = {
          reference: 'Made 1:1',
          startedAt: Date.UTC(2026, 4, 1),
          grade: 3,
          suggested: 3,
          words: 9,
          missed: 0,
          peeked: 0,
          extra: 0,
        };
        const grown = { ...planted, startedAt: planted.startedAt + 2 * DAY };
        const chimes: Growth[] = [];
        device.launch([[keyOf(planted), JSON.stringify(planted)]]).fail('open', 4);
        yield* Effect.scoped(
          Effect.gen(function* () {
            const { garden, recalls } = yield* launch(chimes, []);
            expect((yield* garden.view)._tag).toBe('Unread');
            yield* recalls.keep(grown);
            expect([(yield* garden.view)._tag, recallKeysOn().length, chimes.length]).toEqual([
              'Unread',
              1,
              0,
            ]);
            yield* recalls.keep({ ...grown, peeked: 1 });
            expect([(yield* garden.view)._tag, recallKeysOn().length, chimes.length]).toEqual([
              'Unread',
              2,
              0,
            ]);
            yield* TestClock.adjust('1 minute');
            expect(device.calls).toEqual({ open: 5, keys: 0, get: 0, set: 1, remove: 0, clear: 0 });
          }),
        );
        device.launch(device.disk);
        yield* Effect.scoped(
          Effect.gen(function* () {
            const { garden } = yield* launch(chimes, []);
            expect(known(yield* garden.view)).toEqual([
              ['Made 1:1', [planted, { ...grown, peeked: 1 }]],
            ]);
          }),
        );
      }),
    ));

  it('reads the whole store again after a record read fails, never a partial history, and skips a listed key with no value', () =>
    quietly(
      Effect.gen(function* () {
        const first: Recall = {
          reference: 'Made 2:3',
          startedAt: Date.UTC(2026, 4, 1),
          grade: 3,
          suggested: 3,
          words: 9,
          missed: 0,
          peeked: 0,
          extra: 0,
        };
        const second = { ...first, startedAt: first.startedAt + 3 * DAY };
        const empty = `heartseed/recall/Made 2:3/${first.startedAt + DAY}`;
        const disk: [string, string | null][] = [
          [keyOf(first), JSON.stringify(first)],
          [empty, null],
          [keyOf(second), JSON.stringify(second)],
        ];
        device.launch(disk).fail('get', 2);
        const logs: Log[] = [];
        yield* Effect.scoped(
          Effect.gen(function* () {
            const { garden } = yield* launch([], logs);
            expect(known(yield* garden.view)).toEqual([['Made 2:3', [first, second]]]);
            expect([device.calls.keys, device.calls.get]).toEqual([3, 5]);
            expect(
              logs.filter((x) => x.message === 'garden.record.skipped').map((x) => x.key),
            ).toEqual([empty]);
          }),
        );
        device.launch(disk).fail('get', 3);
        yield* Effect.scoped(
          Effect.gen(function* () {
            const { garden } = yield* launch([], []);
            expect((yield* garden.view)._tag).toBe('Unread');
            expect([device.calls.keys, device.calls.get]).toEqual([3, 3]);
          }),
        );
      }),
    ));
});

/** An honest store over a map that yields up to `yields()` times before each write, so writes would land out of call order without the garden's lock. */
const yielding = (backing: Map<string, string>, yields: () => number) =>
  Layer.succeed(
    KeyValueStore.KeyValueStore,
    KeyValueStore.makeStringOnly({
      get: (key) => Effect.sync(() => backing.get(key)),
      set: (key, value) =>
        Effect.andThen(
          Effect.forEach(Array.from({ length: yields() }), () => Effect.yieldNow),
          Effect.sync(() => void backing.set(key, value)),
        ),
      remove: (key) => Effect.sync(() => void backing.delete(key)),
      clear: Effect.sync(() => backing.clear()),
      size: Effect.sync(() => backing.size),
      keys: Effect.sync(() => [...backing.keys()]),
    }),
  );

describe('keeps that overlap', () => {
  it('end at the last one called, with the model’s plants and chimes, over 120 runs', () =>
    quietly(
      Effect.gen(function* () {
        for (let seed = 1; seed <= 120; seed += 1) {
          const next = random(seed * 101);
          const backing = new Map<string, string>();
          const chimes: Growth[] = [];
          const model = new GardenModel();
          yield* Effect.scoped(
            Effect.gen(function* () {
              const services = yield* Layer.build(
                layer.pipe(
                  Layer.provide(
                    Layer.mergeAll(
                      yielding(backing, () => below(next, 4)),
                      chimeInto(chimes),
                    ),
                  ),
                ),
              );
              const recalls = Context.get(services, Recalls);
              const first: Recall = {
                reference: 'Made 1:1',
                startedAt: Date.UTC(2026, 5, 1),
                grade: 3,
                suggested: 3,
                words: 9,
                missed: 1,
                peeked: 0,
                extra: 0,
              };
              yield* recalls.keep(first);
              model.keep(first);
              const startedAt = first.startedAt + (1 + below(next, 5)) * DAY;
              const calls = Array.from({ length: 2 + below(next, 5) }, (_, i): Recall => ({
                ...first,
                startedAt,
                grade: pickOf(next, [1, 2, 3, 4] as const),
                peeked: i > 0 && next() < 0.5 ? 1 : 0,
              }));
              yield* Effect.forEach(calls, (recall) => recalls.keep(recall), { concurrency: 6 });
              for (const recall of calls) model.keep(recall);
              expect({ seed, knows: known(yield* Context.get(services, Garden).view) }).toEqual({
                seed,
                knows: modelKnows(model),
              });
              expect({
                seed,
                stored: JSON.parse(
                  backing.get(keyOf({ reference: first.reference, startedAt })) ?? '{}',
                ),
              }).toEqual({ seed, stored: { ...calls.at(-1) } });
              expect({ seed, chimes }).toEqual({ seed, chimes: model.chimes });
            }),
          );
        }
      }),
    ));
});
