import { describe, expect, it } from 'effect-bun-test';
import {
  Clock,
  Deferred,
  Duration,
  Effect,
  Fiber,
  Layer,
  Logger,
  Option,
  Path,
  Schema,
} from 'effect';
import { TestClock } from 'effect/testing';
import { memoryFileSystem, memoryLocks, memoryManifestLock, text } from '../host/testing.ts';
import { ContentStore, Processes } from '../content-store.ts';
import { ManifestLock } from '../manifest-lock.ts';
import {
  type Stage,
  type StageFailed,
  WaitingOwner,
  buildGraph,
  fileInput,
  optionalInput,
  stageInput,
} from './graph.ts';

type BuildOptions = Parameters<typeof buildGraph>[1];

const options = (over: Partial<BuildOptions> = {}): BuildOptions => ({
  root: '/',
  cache: '/cache',
  plan: false,
  touch: [],
  spend: new Set(),
  ...over,
});

const RunningMarks = Schema.fromJsonString(
  Schema.Struct({ running: Schema.Record(Schema.String, Schema.Unknown) }),
);

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

const countingTakes = (files: Map<string, Uint8Array>, takes: { n: number }) =>
  ContentStore.layer.pipe(
    Layer.provideMerge([
      memoryFileSystem(files),
      Path.layer,
      Layer.sync(ManifestLock, () => {
        const locks = memoryManifestLock();
        return ManifestLock.of({
          take: (file) =>
            Effect.andThen(
              Effect.sync(() => takes.n++),
              locks.take(file),
            ),
        });
      }),
    ]),
  );

const rootedGraph = (runs: Map<string, number>, checkout: string) => {
  const counted = (id: string, bytes: Effect.Effect<Uint8Array, StageFailed>) =>
    Effect.sync(() => runs.set(id, (runs.get(id) ?? 0) + 1)).pipe(Effect.andThen(bytes));
  const stages: ReadonlyArray<Stage<never>> = [
    {
      id: 'drawing:front',
      view: 'turnaround-front',
      inputs: [fileInput(`${checkout}/in/view.png`)],
      version: '1',
      run: (ctx) => counted('drawing:front', ctx.file(`${checkout}/in/view.png`)),
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
      inputs: [stageInput('parts:front'), fileInput(`${checkout}/in/puppets.ts`)],
      version: '1',
      run: (ctx) => counted('cut:front', ctx.output('parts:front')),
    },
    {
      id: 'parts:k2',
      view: 'raise/k2',
      inputs: [fileInput(`${checkout}/in/k2.png`)],
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
const fakeGraph = (runs: Map<string, number>) => rootedGraph(runs, '');

const seeded = () =>
  new Map<string, Uint8Array>([
    ['/in/view.png', text('front pixels')],
    ['/in/puppets.ts', text('export const PUPPETS = {}')],
    ['/in/k2.png', text('k2 pixels')],
  ]);

const statesOf = (report: { readonly stages: ReadonlyArray<{ id: string; state: string }> }) =>
  Object.fromEntries(report.stages.map((s) => [s.id, s.state]));

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

  it.effect(
    'a file input is keyed by its path from the root: the same tree in another checkout reads every stage cached',
    () => {
      const files = new Map<string, Uint8Array>();
      const runs = new Map<string, number>();
      for (const checkout of ['/one', '/two'])
        for (const [file, bytes] of seeded()) files.set(`${checkout}${file}`, bytes);
      return Effect.gen(function* () {
        const first = yield* buildGraph(rootedGraph(runs, '/one'), options({ root: '/one' }));
        expect(statesOf(first)['cut:front']).toBe('ran');
        runs.clear();
        const other = yield* buildGraph(
          rootedGraph(runs, '/two'),
          options({ root: '/two', plan: true }),
        );
        expect(statesOf(other)).toEqual({
          'drawing:front': 'cached',
          'parts:front': 'cached',
          'cut:front': 'cached',
          'parts:k2': 'waiting-spend',
          'cut:k2': 'waiting-spend',
        });
        expect(other.stages.map((s) => s.key)).toEqual(first.stages.map((s) => s.key));
        expect(runs.size).toBe(0);
      }).pipe(Effect.provide(servicesOver(files)));
    },
  );

  it.effect(
    "two members' files whose paths differ only in the member never share a key, bytes equal",
    () => {
      const files = new Map<string, Uint8Array>([
        ['/repo/cast/sower/cutout/coverage.ts', text('export const COVERAGE = {}')],
        ['/repo/cast/feast-mother/cutout/coverage.ts', text('export const COVERAGE = {}')],
      ]);
      const reading = (member: string): ReadonlyArray<Stage<never>> => [
        {
          id: 'coverage',
          inputs: [fileInput(`/repo/cast/${member}/cutout/coverage.ts`)],
          version: '1',
          run: () => Effect.succeed(text(member)),
        },
      ];
      return Effect.gen(function* () {
        const sower = yield* buildGraph(reading('sower'), options({ root: '/repo' }));
        const mother = yield* buildGraph(reading('feast-mother'), options({ root: '/repo' }));
        expect(statesOf(mother)).toEqual({ coverage: 'ran' });
        expect(mother.stages[0]?.key).not.toEqual(sower.stages[0]?.key);
      }).pipe(Effect.provide(servicesOver(files)));
    },
  );

  it.effect(
    'a file input outside the root is refused before any stage runs: its key would name the checkout',
    () => {
      const files = seeded();
      const runs = new Map<string, number>();
      return Effect.gen(function* () {
        const error = yield* buildGraph(fakeGraph(runs), options({ root: '/repo' })).pipe(
          Effect.flip,
        );
        expect(error._tag).toBe('GraphInvalid');
        expect(error._tag === 'GraphInvalid' && error.reason).toContain('/in/view.png');
        expect(runs.size).toBe(0);
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

  it.effect(
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
        yield* Deferred.await(busy);
        yield* Deferred.succeed(slow.release, true);
        expect(statesOf(yield* Fiber.join(first))).toEqual({ train: 'ran' });
        yield* TestClock.adjust('5 seconds');
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
      yield* TestClock.adjust('5 seconds');
      expect(statesOf(yield* Fiber.join(waiting))).toEqual({ train: 'cached' });
      expect(slow.runs()).toBe(1);
    }).pipe(Effect.provide(servicesOver(files)));
  });

  it.effect(
    "a build waiting on another build's run decides again every five seconds once it has waited a while",
    () => {
      const takes = { n: 0 };
      return Effect.gen(function* () {
        const slow = yield* slowTrain;
        const first = yield* Effect.forkChild(buildGraph(slow.stages, options()).pipe(onHost('a')));
        yield* Deferred.await(slow.started);
        const waiting = yield* Effect.forkChild(
          buildGraph(slow.stages, options()).pipe(onHost('a')),
        );
        yield* TestClock.adjust('1 minute');
        takes.n = 0;
        yield* TestClock.adjust('10 minutes');
        expect(takes.n).toBeGreaterThanOrEqual(128);
        expect(takes.n).toBeLessThanOrEqual(132);
        yield* Deferred.succeed(slow.release, true);
        expect(statesOf(yield* Fiber.join(first))).toEqual({ train: 'ran' });
        yield* TestClock.adjust('5 seconds');
        expect(statesOf(yield* Fiber.join(waiting))).toEqual({ train: 'cached' });
        expect(slow.runs()).toBe(1);
      }).pipe(Effect.provide(countingTakes(seeded(), takes)));
    },
  );

  it.effect(
    "another host's mark whose heartbeat stopped frees its key five minutes after its last beat",
    () => {
      const files = seeded();
      return Effect.gen(function* () {
        const slow = yield* slowTrain;
        const first = yield* Effect.forkChild(buildGraph(slow.stages, options()).pipe(onHost('a')));
        yield* Deferred.await(slow.started);
        yield* TestClock.adjust('61 minutes');
        const left = files.get('/cache/build.json') ?? text('');
        yield* Fiber.interrupt(first);
        files.set('/cache/build.json', left);
        const second = yield* Effect.forkChild(
          buildGraph(slow.stages, options()).pipe(onHost('b')),
        );
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

  it.effect(
    'another host whose clock runs two hours behind keeps its key while its heartbeat changes',
    () => {
      const files = seeded();
      return Effect.gen(function* () {
        const slow = yield* slowTrain;
        const first = yield* Effect.forkChild(
          buildGraph(slow.stages, options()).pipe(
            onHost('a'),
            skewed(yield* Clock.Clock, '-2 hours'),
          ),
        );
        yield* Deferred.await(slow.started);
        const waiting = yield* Effect.forkChild(
          buildGraph(slow.stages, options()).pipe(onHost('b')),
        );
        yield* TestClock.adjust('20 minutes');
        expect(slow.runs()).toBe(1);
        yield* Deferred.succeed(slow.release, true);
        expect(statesOf(yield* Fiber.join(first))).toEqual({ train: 'ran' });
        yield* TestClock.adjust('5 seconds');
        expect(statesOf(yield* Fiber.join(waiting))).toEqual({ train: 'cached' });
        expect(slow.runs()).toBe(1);
      }).pipe(Effect.provide(servicesOver(files)));
    },
  );

  it.effect(
    'a mark from a host whose clock runs two hours ahead frees its key five minutes after its beat stops changing',
    () => {
      const files = seeded();
      return Effect.gen(function* () {
        const slow = yield* slowTrain;
        const first = yield* Effect.forkChild(
          buildGraph(slow.stages, options()).pipe(
            onHost('a'),
            skewed(yield* Clock.Clock, '2 hours'),
          ),
        );
        yield* Deferred.await(slow.started);
        yield* TestClock.adjust('3 minutes');
        const left = files.get('/cache/build.json') ?? text('');
        yield* Fiber.interrupt(first);
        files.set('/cache/build.json', left);
        const second = yield* Effect.forkChild(
          buildGraph(slow.stages, options()).pipe(onHost('b')),
        );
        yield* TestClock.adjust('4 minutes');
        expect(slow.runs()).toBe(1);
        yield* TestClock.adjust('2 minutes');
        expect(yield* Deferred.isDone(slow.restarted)).toBe(true);
        expect(slow.runs()).toBe(2);
        yield* Deferred.succeed(slow.release, true);
        expect(statesOf(yield* Fiber.join(second))).toEqual({ train: 'ran' });
      }).pipe(Effect.provide(servicesOver(files)));
    },
  );

  it.effect('a build whose mark was taken while it ran discards its output (fencing)', () => {
    const files = seeded();
    return Effect.gen(function* () {
      const slow = yield* slowTrain;
      const first = yield* Effect.forkChild(buildGraph(slow.stages, options()).pipe(onHost('a')));
      yield* Deferred.await(slow.started);
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

const skewed = (clock: Clock.Clock, offset: Duration.Input) => {
  const ms = Duration.toMillis(offset);
  const off: Clock.Clock = {
    currentTimeMillisUnsafe: () => clock.currentTimeMillisUnsafe() + ms,
    currentTimeMillis: Effect.map(clock.currentTimeMillis, (t) => t + ms),
    currentTimeNanosUnsafe: () => clock.currentTimeNanosUnsafe() + BigInt(ms) * 1_000_000n,
    currentTimeNanos: Effect.map(clock.currentTimeNanos, (t) => t + BigInt(ms) * 1_000_000n),
    monotonicTimeNanosUnsafe: () => clock.monotonicTimeNanosUnsafe(),
    monotonicTimeNanos: clock.monotonicTimeNanos,
    sleep: (duration) => clock.sleep(duration),
  };
  return <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.provideService(effect, Clock.Clock, off);
};

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

const busyLogged = (busy: Deferred.Deferred<boolean>) =>
  Logger.layer([
    Logger.make(({ message }) => {
      if ([message].flat().join(' ').startsWith('cast.build.busy'))
        Deferred.doneUnsafe(busy, Effect.succeed(true));
    }),
  ]);
