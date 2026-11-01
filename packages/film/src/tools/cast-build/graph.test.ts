// The cast build's stage graph over a fake graph in memory: a rerun with
// nothing changed runs nothing, a stage that makes the same bytes stops the
// rerun there, `--touch` plans one input's change, and a stage that would
// spend, or waits on the owner, holds every stage below it.

import { describe, expect, it } from 'effect-bun-test';
import { Deferred, Effect, Fiber, Layer, Logger, Option, Path, Schema } from 'effect';
import { TestClock } from 'effect/testing';
import { memoryFileSystem, memoryLocks, text } from '../host/testing.ts';
import { ContentStore, Processes } from '../content-store.ts';
import {
  type BuildOptions,
  type Stage,
  type StageFailed,
  WaitingOwner,
  buildGraph,
  fileInput,
  optionalInput,
  stageInput,
} from './graph.ts';

const options = (over: Partial<BuildOptions> = {}): BuildOptions => ({
  cache: '/cache',
  plan: false,
  touch: [],
  spend: new Set(),
  ...over,
});

/** `build.json`'s running marks, as a test reads them. */
const RunningMarks = Schema.fromJsonString(
  Schema.Struct({ running: Schema.Record(Schema.String, Schema.Unknown) }),
);

/** `build.json`'s stages and each running mark's build, as a test reads and writes them. */
const Marks = Schema.fromJsonString(
  Schema.Struct({
    stages: Schema.Record(Schema.String, Schema.Unknown),
    running: Schema.Record(
      Schema.String,
      Schema.Struct({
        build: Schema.String,
        pid: Schema.optionalKey(Schema.Finite),
        host: Schema.optionalKey(Schema.String),
        at: Schema.optionalKey(Schema.Finite),
        beat: Schema.optionalKey(Schema.Finite),
      }),
    ),
  }),
);

const servicesOver = (files: Map<string, Uint8Array>) =>
  ContentStore.layer.pipe(Layer.provideMerge([memoryFileSystem(files), Path.layer, memoryLocks]));

/**
 * drawing (reads /in/view.png) → parts (its bytes' length, so a same-length
 * change makes the same output) → cut; and a key that spends okra; each run
 * counted in `runs`.
 */
const fakeGraph = (runs: Map<string, number>) => {
  const counted = (id: string, bytes: Effect.Effect<Uint8Array, StageFailed>) =>
    Effect.sync(() => runs.set(id, (runs.get(id) ?? 0) + 1)).pipe(Effect.andThen(bytes));
  const stages: ReadonlyArray<Stage<never>> = [
    {
      id: 'drawing:front',
      view: 'turnaround-front',
      inputs: [fileInput('/in/view.png')],
      version: '1',
      run: (ctx) => counted('drawing:front', ctx.file('/in/view.png')),
    },
    {
      id: 'parts:front',
      view: 'turnaround-front',
      inputs: [stageInput('drawing:front')],
      version: '1',
      run: (ctx) =>
        counted(
          'parts:front',
          ctx.output('drawing:front').pipe(Effect.map((b) => text(`length ${b.length}`))),
        ),
    },
    {
      id: 'cut:front',
      view: 'turnaround-front',
      inputs: [stageInput('parts:front'), fileInput('/in/puppets.ts')],
      version: '1',
      run: (ctx) => counted('cut:front', ctx.output('parts:front')),
    },
    {
      id: 'parts:k2',
      view: 'raise/k2',
      inputs: [fileInput('/in/k2.png')],
      version: '1',
      run: (ctx) => ctx.spend('okra', counted('parts:k2', Effect.succeed(text('k2 parts')))),
    },
    {
      id: 'cut:k2',
      view: 'raise/k2',
      inputs: [stageInput('parts:k2')],
      version: '1',
      run: (ctx) => counted('cut:k2', ctx.output('parts:k2')),
    },
  ];
  return stages;
};

const seeded = () =>
  new Map<string, Uint8Array>([
    ['/in/view.png', text('front pixels')],
    ['/in/puppets.ts', text('export const PUPPETS = {}')],
    ['/in/k2.png', text('k2 pixels')],
  ]);

const statesOf = (report: { readonly stages: ReadonlyArray<{ id: string; state: string }> }) =>
  Object.fromEntries(report.stages.map((s) => [s.id, s.state]));

/** The fake graph and a set of the cuts known in this build, read through optional inputs. */
const withSet = (runs: Map<string, number>, made: Array<string>): ReadonlyArray<Stage<never>> => [
  ...fakeGraph(runs),
  {
    id: 'set',
    inputs: [optionalInput('cut:front'), optionalInput('cut:k2')],
    version: '1',
    run: (ctx) =>
      Effect.sync(() => {
        const set = ['cut:front', 'cut:k2'].filter((id) => ctx.known(id)).join(',');
        made.push(set);
        return text(set);
      }),
  },
];

describe('the cast build graph', () => {
  it.effect('a waiting optional input does not hold its stage, and joins it once built', () => {
    const files = seeded();
    const runs = new Map<string, number>();
    const made: Array<string> = [];
    return Effect.gen(function* () {
      const first = yield* buildGraph(withSet(runs, made), options());
      expect(statesOf(first)).toMatchObject({ 'cut:k2': 'waiting-spend', set: 'ran' });
      expect(made.at(-1)).toBe('cut:front');
      const plan = yield* buildGraph(
        withSet(runs, made),
        options({ plan: true, touch: ['/in/k2.png'] }),
      );
      expect(statesOf(plan)).toMatchObject({ 'cut:k2': 'stale', set: 'stale' });
      const second = yield* buildGraph(withSet(runs, made), options({ spend: new Set(['okra']) }));
      expect(statesOf(second)).toMatchObject({ 'cut:k2': 'ran', set: 'ran' });
      expect(made.at(-1)).toBe('cut:front,cut:k2');
    }).pipe(Effect.provide(servicesOver(files)));
  });

  it.effect('a second build with nothing changed runs no stage', () => {
    const files = seeded();
    const runs = new Map<string, number>();
    const stages = fakeGraph(runs);
    return Effect.gen(function* () {
      const first = yield* buildGraph(stages, options());
      expect(statesOf(first)).toEqual({
        'drawing:front': 'ran',
        'parts:front': 'ran',
        'cut:front': 'ran',
        'parts:k2': 'waiting-spend',
        'cut:k2': 'waiting-spend',
      });
      runs.clear();
      const second = yield* buildGraph(stages, options());
      expect(statesOf(second)).toEqual({
        'drawing:front': 'cached',
        'parts:front': 'cached',
        'cut:front': 'cached',
        'parts:k2': 'waiting-spend',
        'cut:k2': 'waiting-spend',
      });
      expect(runs.size).toBe(0);
      expect(second.okraCalls).toBe(0);
      expect(second.modalCalls).toBe(0);
      expect(second.stages.find((s) => s.id === 'cut:front')?.key).toEqual(
        first.stages.find((s) => s.id === 'cut:front')?.key,
      );
    }).pipe(Effect.provide(servicesOver(files)));
  });

  it.effect('a stage that makes the same bytes again stops the rerun there', () => {
    const files = seeded();
    const runs = new Map<string, number>();
    const stages = fakeGraph(runs);
    return Effect.gen(function* () {
      yield* buildGraph(stages, options());
      files.set('/in/view.png', text('front PIXELS'));
      runs.clear();
      const again = yield* buildGraph(stages, options());
      expect(statesOf(again)['drawing:front']).toBe('ran');
      expect(statesOf(again)['parts:front']).toBe('ran');
      expect(statesOf(again)['cut:front']).toBe('cached');
      expect(runs.get('cut:front')).toBeUndefined();
      files.set('/in/view.png', text('a longer front drawing'));
      const longer = yield* buildGraph(stages, options());
      expect(statesOf(longer)['cut:front']).toBe('ran');
    }).pipe(Effect.provide(servicesOver(files)));
  });

  it.effect(
    '--touch plans one input as changed, marks it and all below it stale, and runs nothing',
    () => {
      const files = seeded();
      const runs = new Map<string, number>();
      const stages = fakeGraph(runs);
      return Effect.gen(function* () {
        yield* buildGraph(stages, options());
        runs.clear();
        const touched = yield* buildGraph(
          stages,
          options({ plan: true, touch: ['/in/puppets.ts'] }),
        );
        expect(statesOf(touched)).toEqual({
          'drawing:front': 'cached',
          'parts:front': 'cached',
          'cut:front': 'stale',
          'parts:k2': 'waiting-spend',
          'cut:k2': 'waiting-spend',
        });
        expect(touched.stages.find((s) => s.id === 'parts:k2')?.reason).toEqual(
          Option.some('needs --spend okra'),
        );
        const granted = yield* buildGraph(
          stages,
          options({ plan: true, spend: new Set(['okra']) }),
        );
        expect(statesOf(granted)['parts:k2']).toBe('stale');
        expect(statesOf(granted)['cut:front']).toBe('cached');
        expect(runs.size).toBe(0);
        const drawing = yield* buildGraph(stages, options({ plan: true, touch: ['/in/view.png'] }));
        expect(statesOf(drawing)['drawing:front']).toBe('stale');
        expect(statesOf(drawing)['cut:front']).toBe('stale');
        expect(runs.size).toBe(0);
      }).pipe(Effect.provide(servicesOver(files)));
    },
  );

  it.effect('a stage spends only when --spend names it, and counts the call', () => {
    const files = seeded();
    const runs = new Map<string, number>();
    const stages = fakeGraph(runs);
    return Effect.gen(function* () {
      const refused = yield* buildGraph(stages, options({ spend: new Set(['modal']) }));
      expect(statesOf(refused)['parts:k2']).toBe('waiting-spend');
      expect(runs.get('parts:k2')).toBeUndefined();
      expect(refused.okraCalls).toBe(0);
      const spent = yield* buildGraph(stages, options({ spend: new Set(['okra']) }));
      expect(statesOf(spent)['parts:k2']).toBe('ran');
      expect(statesOf(spent)['cut:k2']).toBe('ran');
      expect(spent.okraCalls).toBe(1);
      const after = yield* buildGraph(stages, options());
      expect(statesOf(after)['cut:k2']).toBe('cached');
      expect(after.okraCalls).toBe(0);
    }).pipe(Effect.provide(servicesOver(files)));
  });

  it.effect(
    'a stage waiting on the owner holds every stage below it, and is asked again next build',
    () => {
      const files = seeded();
      const runs = new Map<string, number>();
      const stages: ReadonlyArray<Stage<never>> = [
        ...fakeGraph(runs),
        {
          id: 'ask',
          inputs: [],
          version: '1',
          run: () =>
            Effect.sync(() => runs.set('ask', (runs.get('ask') ?? 0) + 1)).pipe(
              Effect.andThen(Effect.fail(WaitingOwner.make({ reason: 'raise/k7 not drawn' }))),
            ),
        },
        {
          id: 'after-ask',
          inputs: [stageInput('ask'), stageInput('cut:front')],
          version: '1',
          run: () => Effect.succeed(text('done')),
        },
      ];
      return Effect.gen(function* () {
        yield* buildGraph(stages, options());
        const again = yield* buildGraph(stages, options());
        expect(statesOf(again)['ask']).toBe('waiting-owner');
        expect(statesOf(again)['after-ask']).toBe('waiting-owner');
        expect(again.stages.find((s) => s.id === 'ask')?.reason).toEqual(
          Option.some('raise/k7 not drawn'),
        );
        expect(runs.get('ask')).toBe(2);
      }).pipe(Effect.provide(servicesOver(files)));
    },
  );

  it.effect('a stage naming a stage not before it is refused before any stage runs', () => {
    const files = seeded();
    const runs = new Map<string, number>();
    const stages = fakeGraph(runs);
    return Effect.gen(function* () {
      const error = yield* buildGraph([...stages.slice(1), ...stages.slice(0, 1)], options()).pipe(
        Effect.flip,
      );
      expect(error._tag).toBe('GraphInvalid');
      expect(runs.size).toBe(0);
    }).pipe(Effect.provide(servicesOver(files)));
  });

  it.live(
    'a stage runs outside the lock: a plan reads meanwhile, and a second build waits on it',
    () => {
      const busy = Deferred.makeUnsafe<boolean>();
      return Effect.gen(function* () {
        const slow = yield* slowTrain;
        const first = yield* Effect.forkChild(buildGraph(slow.stages, options()));
        yield* Deferred.await(slow.started);
        const plan = yield* buildGraph(slow.stages, options({ plan: true }));
        expect(statesOf(plan)).toEqual({ train: 'stale' });
        const second = yield* Effect.forkChild(buildGraph(slow.stages, options()));
        // the second build finds the first's mark and waits on it
        yield* Deferred.await(busy);
        yield* Deferred.succeed(slow.release, true);
        expect(statesOf(yield* Fiber.join(first))).toEqual({ train: 'ran' });
        expect(statesOf(yield* Fiber.join(second))).toEqual({ train: 'cached' });
        expect(slow.runs()).toBe(1);
      }).pipe(Effect.provide(Layer.mergeAll(servicesOver(seeded()), busyLogged(busy))));
    },
  );

  it.live('a running mark whose process is gone is taken over', () =>
    Effect.gen(function* () {
      const slow = yield* slowTrain;
      const first = yield* Effect.forkChild(buildGraph(slow.stages, options()));
      yield* Deferred.await(slow.started);
      // the first build's process reads as gone, so the second runs the stage itself
      const second = yield* Effect.forkChild(buildGraph(slow.stages, options()));
      yield* Deferred.await(slow.restarted);
      expect(slow.runs()).toBe(2);
      yield* Deferred.succeed(slow.release, true);
      yield* Fiber.join(first);
      expect(statesOf(yield* Fiber.join(second))).toEqual({ train: 'ran' });
    }).pipe(
      Effect.provideService(Processes, { host: 'h', alive: () => Effect.succeed(false) }),
      Effect.provide(servicesOver(seeded())),
    ),
  );

  it.effect("another host's live build keeps its key past an hour: its heartbeat renews it", () => {
    const files = seeded();
    return Effect.gen(function* () {
      const slow = yield* slowTrain;
      const first = yield* Effect.forkChild(buildGraph(slow.stages, options()).pipe(onHost('a')));
      yield* Deferred.await(slow.started);
      yield* TestClock.adjust('61 minutes');
      const waiting = yield* Effect.forkChild(buildGraph(slow.stages, options()).pipe(onHost('b')));
      yield* TestClock.adjust('20 minutes');
      expect(slow.runs()).toBe(1);
      yield* Deferred.succeed(slow.release, true);
      expect(statesOf(yield* Fiber.join(first))).toEqual({ train: 'ran' });
      yield* TestClock.adjust('1 second');
      expect(statesOf(yield* Fiber.join(waiting))).toEqual({ train: 'cached' });
      expect(slow.runs()).toBe(1);
    }).pipe(Effect.provide(servicesOver(files)));
  });

  it.effect(
    "another host's mark whose heartbeat stopped frees its key five minutes after its last beat",
    () => {
      const files = seeded();
      return Effect.gen(function* () {
        const slow = yield* slowTrain;
        const first = yield* Effect.forkChild(buildGraph(slow.stages, options()).pipe(onHost('a')));
        yield* Deferred.await(slow.started);
        // host a's build beats for an hour, then host a goes dark: its build stops (and its
        // heartbeat with it), its mark left behind with its last beat at 61 minutes
        yield* TestClock.adjust('61 minutes');
        const left = files.get('/cache/build.json') ?? text('');
        yield* Fiber.interrupt(first);
        files.set('/cache/build.json', left);
        const second = yield* Effect.forkChild(
          buildGraph(slow.stages, options()).pipe(onHost('b')),
        );
        // the lease runs from the last beat, not from the mark's start
        yield* TestClock.adjust('4 minutes');
        expect(slow.runs()).toBe(1);
        yield* TestClock.adjust('2 minutes');
        yield* Deferred.await(slow.restarted);
        expect(slow.runs()).toBe(2);
        yield* Deferred.succeed(slow.release, true);
        expect(statesOf(yield* Fiber.join(second))).toEqual({ train: 'ran' });
        const manifest = new TextDecoder().decode(files.get('/cache/build.json'));
        expect((yield* Schema.decodeEffect(RunningMarks)(manifest)).running).toEqual({});
      }).pipe(Effect.provide(servicesOver(files)));
    },
  );

  it.effect('a build whose mark was taken while it ran discards its output (fencing)', () => {
    const files = seeded();
    return Effect.gen(function* () {
      const slow = yield* slowTrain;
      const first = yield* Effect.forkChild(buildGraph(slow.stages, options()).pipe(onHost('a')));
      yield* Deferred.await(slow.started);
      // another build takes the key meanwhile (as host b would past a lost lease)
      const manifest = new TextDecoder().decode(files.get('/cache/build.json'));
      const [key] = Object.keys((yield* Schema.decodeEffect(RunningMarks)(manifest)).running);
      const taken = yield* Schema.encodeEffect(Marks)({
        stages: {},
        running: { [key ?? '']: { build: 'other', pid: 1, host: 'b', at: 0, beat: 0 } },
      });
      files.set('/cache/build.json', text(taken));
      yield* Deferred.succeed(slow.release, true);
      const report = yield* Fiber.join(first);
      expect(statesOf(report)).toEqual({ train: 'failed' });
      expect(report.stages[0]?.reason).toEqual(
        Option.some('another build took its key while it ran; its output is discarded'),
      );
      const after = yield* Schema.decodeEffect(Marks)(
        new TextDecoder().decode(files.get('/cache/build.json')),
      );
      expect(after.stages).toEqual({});
      expect(Object.values(after.running).map((mark) => mark.build)).toEqual(['other']);
    }).pipe(Effect.provide(servicesOver(files)));
  });
});

const onHost = (host: string) =>
  Effect.provideService(Processes, { host, alive: () => Effect.succeed(true) });

/**
 * A train that marks `started` at its first run and `restarted` at its second,
 * and makes its output once `release` is done.
 */
const slowTrain = Effect.gen(function* () {
  const started = yield* Deferred.make<boolean>();
  const restarted = yield* Deferred.make<boolean>();
  const release = yield* Deferred.make<boolean>();
  let count = 0;
  const stages: ReadonlyArray<Stage<never>> = [
    {
      id: 'train',
      inputs: [fileInput('/in/view.png')],
      version: '1',
      run: () =>
        Effect.gen(function* () {
          count++;
          if (count === 1) yield* Deferred.succeed(started, true);
          if (count === 2) yield* Deferred.succeed(restarted, true);
          yield* Deferred.await(release);
          return text('checkpoint');
        }),
    },
  ];
  return { stages, started, restarted, release, runs: () => count };
});

/** The logger that completes `busy` when a build logs that it waits on another build's run. */
const busyLogged = (busy: Deferred.Deferred<boolean>) =>
  Logger.layer([
    Logger.make(({ message }) => {
      if ([message].flat().join(' ').startsWith('cast.build.busy'))
        Deferred.doneUnsafe(busy, Effect.succeed(true));
    }),
  ]);
