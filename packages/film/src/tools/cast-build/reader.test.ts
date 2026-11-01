// The train and eval stages over a fake training set, with the reader's live
// layer replaced: no Modal call without `--spend modal`; one train, then
// each drawing's eval, when it is allowed; a rerun asks the reader nothing;
// a change to one of the reader's source files is a new train.

import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { describe, expect, it } from 'effect-bun-test';
import {
  ConfigProvider,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Schema,
  Sink,
  Stream,
} from 'effect';
import { ChildProcessSpawner } from 'effect/process';
import { sha256Hex } from '../digest.ts';
import { memoryFileSystem, memoryLocks, text } from '../host/testing.ts';
import { ContentStore } from '../content-store.ts';
import { type Stage, buildGraph, fileInput, stageInput } from './graph.ts';
import { CastReader } from './reader.ts';
import { candidatesOf, evalStage, memberStages, trainStage, trainsetStage } from './stages.ts';

/** What a build is asked with, as `buildGraph` takes it. */
type BuildOptions = Parameters<typeof buildGraph>[1];

const options = (over: Partial<BuildOptions> = {}): BuildOptions => ({
  cache: '/cache',
  plan: false,
  touch: [],
  spend: new Set(),
  ...over,
});

const SOURCES = ['/reader/model.py', '/reader/uv.lock'];
const VIEWS = ['front', 'side'];
/** A parts stage's output as the status stage reads it: the part files and the record, if any. */
const partsOutput = (parts: { readonly files: ReadonlyArray<string>; readonly record?: string }) =>
  Effect.succeed(
    text(
      Schema.encodeSync(
        Schema.fromJsonString(
          Schema.Struct({
            files: Schema.Array(Schema.String),
            record: Schema.optionalKey(Schema.String),
          }),
        ),
      )(parts),
    ),
  );

/** The train config's backbone and input, as its JSON names them. */
const decodeTrainConfig = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      backbone: Schema.String,
      inputSide: Schema.Struct({ width: Schema.Finite, height: Schema.Finite }),
    }),
  ),
);

/** Member `m`: a puppet entry per view, cut from its own sheet. */
const MEMBER = {
  film: 'f' as never,
  member: 'm',
  memberDir: '/m',
  libraryPuppets: '/library/puppets.ts',
  coverage: {
    member: 'm',
    entries: VIEWS.map((v) => ({ id: v, cut: 'puppet' as const, file: `${v}.png`, for: [] })),
  },
  facts: {},
};
const CANDIDATES = candidatesOf(MEMBER);
/** Each view's status stage as the build makes it (no code sources, so no file of the build's is read). */
const STATUS = Effect.runSync(
  memberStages(MEMBER, {
    stage: { parts: [], cut: [], fit: [], renders: [], eval: [], chain: [] },
    filmCast: [],
    page: [],
  }).pipe(
    Effect.map((stages) => stages.filter((s) => s.id.startsWith('status:'))),
    Effect.provide([memoryFileSystem(new Map()), Path.layer]),
  ),
);
/**
 * View `v`'s status stage. It reads only its inputs' outputs, so it needs
 * none of the build's services; `memberStages` types its list by the
 * services any of its stages needs, hence the cast.
 */
const statusOf = (v: string) =>
  STATUS.filter((s) => s.id === `status:${v}@m`) as unknown as ReadonlyArray<Stage<never>>;

type Ctx = Parameters<Stage<never>['run']>[0];
const fitRows = (pass: boolean) =>
  text(`[{"view":"v","rows":[{"name":"silhouette","pass":${pass}}]}]`);
/** A part sheet's record: `passing` misses no bar; `open` misses `arm` and names none. */
const RECORD = { passing: '{"missed":[]}', open: '{"missed":["arm"],"named":[]}' } as const;
const record = (bars: keyof typeof RECORD) => text(RECORD[bars]);
/** The record file a view's parts stage reads; `none` stands for a sheet with no record yet. */
const recordFile = (view: string) => `/in/${view}.record.json`;

/**
 * Each view's drawing, parts (its record file read off disk, `none` for no
 * record), cut, fit (passing unless `failing` names it), renders (a shard
 * file's bytes) and status stages, the training set, its train and each
 * drawing's eval. When `sideCut` is on, the side's parts stage spends okra
 * and writes a passing record: the side is cut in the build.
 */
const graph = (
  o: { readonly failing?: string; readonly sideCut?: boolean } = {},
): ReadonlyArray<Stage<CastReader>> => [
  ...VIEWS.flatMap((v): ReadonlyArray<Stage<never>> => {
    const at = (kind: string) => `${kind}:${v}@m`;
    const cutInBuild = o.sideCut === true && v === 'side';
    return [
      { id: at('drawing'), inputs: [], version: '1', run: () => Effect.succeed(text(v)) },
      ...[
        {
          id: at('parts'),
          inputs: [stageInput(at('drawing'))],
          version: '1',
          run: (ctx: Ctx) => ctx.spend('okra', partsOutput({ files: [], record: RECORD.passing })),
        },
      ].filter(() => cutInBuild),
      ...[
        {
          id: at('parts'),
          inputs: [stageInput(at('drawing')), fileInput(recordFile(v))],
          version: '1',
          run: (ctx: Ctx) =>
            Effect.flatMap(ctx.file(recordFile(v)), (bytes) =>
              partsOutput(
                Option.match(
                  Option.liftPredicate(new TextDecoder().decode(bytes), (t) => t !== 'none'),
                  { onNone: () => ({ files: [] }), onSome: (r) => ({ files: [], record: r }) },
                ),
              ),
            ),
        },
      ].filter(() => !cutInBuild),
      {
        id: at('cut'),
        inputs: [stageInput(at('parts'))],
        version: '1',
        run: (ctx: Ctx) => ctx.output(at('parts')),
      },
      {
        id: at('fit'),
        inputs: [stageInput(at('cut'))],
        version: '1',
        run: () => Effect.succeed(fitRows(o.failing !== `m/${v}`)),
      },
      {
        id: at('renders'),
        inputs: [stageInput(at('cut')), fileInput(`/in/${at('renders')}.tar`)],
        version: '1',
        run: (ctx: Ctx) => ctx.file(`/in/${at('renders')}.tar`),
      },
      ...statusOf(v),
    ];
  }),
  trainsetStage(CANDIDATES),
  trainStage(CANDIDATES, SOURCES),
  ...CANDIDATES.map((c) => evalStage(c.renders, [])),
];

const files = () =>
  new Map<string, Uint8Array>([
    ['/in/renders:front@m.tar', text('front shard')],
    ['/in/renders:side@m.tar', text('side shard')],
    [recordFile('front'), record('passing')],
    [recordFile('side'), record('passing')],
    ['/reader/model.py', text('model')],
    ['/reader/uv.lock', text('lock')],
  ]);

const build = (
  disk: Map<string, Uint8Array>,
  asked: Array<string>,
  over: Partial<BuildOptions> = {},
  stages: ReadonlyArray<Stage<CastReader>> = graph(),
  reader: { readonly training?: Effect.Effect<void>; readonly promoteFails?: string } = {},
) =>
  buildGraph(stages, options(over)).pipe(
    Effect.provide(
      Layer.mergeAll(
        ContentStore.layer.pipe(
          Layer.provideMerge([memoryFileSystem(disk), Path.layer, memoryLocks]),
        ),
        CastReader.layerTest({ evaluate: '{"seen":{"accuracy":1}}', ...reader }, asked, SOURCES),
      ),
    ),
  );

/** `build.json`'s running marks, as a test reads and writes them. */
const Marks = Schema.fromJsonString(
  Schema.Struct({
    stages: Schema.Record(Schema.String, Schema.Unknown),
    running: Schema.Record(Schema.String, Schema.Unknown),
  }),
);

/** `build.json`'s recorded stages, as far as a run left unpromoted. */
const Built = Schema.fromJsonString(
  Schema.Struct({
    stages: Schema.Record(
      Schema.String,
      Schema.Struct({
        unpromoted: Schema.optionalKey(
          Schema.Struct({ run: Schema.String, reason: Schema.String }),
        ),
      }),
    ),
  }),
);

/** Another host's build takes every key `disk`'s cache marks as running (as it would past a lost lease). */
const takeMarks = (disk: Map<string, Uint8Array>) =>
  Effect.gen(function* () {
    const marks = yield* Schema.decodeEffect(Marks)(
      new TextDecoder().decode(disk.get('/cache/build.json')),
    );
    const other = { build: 'other', pid: 1, host: 'b', at: 0, beat: 0 };
    const taken = Object.fromEntries(Object.keys(marks.running).map((key) => [key, other]));
    disk.set(
      '/cache/build.json',
      text(yield* Schema.encodeEffect(Marks)({ ...marks, running: taken })),
    );
  }).pipe(Effect.orDie);

/** A train the fake reader was asked for: its key and its run. */
const trainOf = (line: string) => {
  const [, key = '', run = ''] = /^train (\S+) run=(\S+) /.exec(line) ?? [];
  return { key, run };
};

const stateOf = (report: { stages: ReadonlyArray<{ id: string; state: string }> }) =>
  Object.fromEntries(report.stages.map((s) => [s.id, s.state]));

describe('cast build: train and eval', () => {
  it.effect(
    'without --spend modal the train waits, its evals wait, and the reader is asked nothing',
    () =>
      Effect.gen(function* () {
        const asked: Array<string> = [];
        const report = yield* build(files(), asked);
        const state = stateOf(report);
        expect(state['train']).toBe('waiting-spend');
        expect(state['eval:front@m']).toBe('waiting-spend');
        expect(state['eval:side@m']).toBe('waiting-spend');
        expect(asked).toEqual([]);
        expect(report.modalCalls).toBe(0);
      }),
  );

  it.effect('allowed, it trains once and scores each drawing; a rerun asks nothing', () =>
    Effect.gen(function* () {
      const disk = files();
      const asked: Array<string> = [];
      const first = yield* build(disk, asked, { spend: new Set(['modal'] as const) });
      expect(stateOf(first)['train']).toBe('ran');
      expect(first.modalCalls).toBe(1);
      expect(asked.filter((a) => a.startsWith('train')).length).toBe(1);
      expect(asked.filter((a) => a.startsWith('evaluate')).length).toBe(2);
      const again: Array<string> = [];
      const second = yield* build(disk, again, { spend: new Set(['modal'] as const) });
      expect(new Set(Object.values(stateOf(second)))).toEqual(new Set(['cached']));
      expect(again).toEqual([]);
    }),
  );

  it.effect(
    "a train writes under its own run; the key's checkpoint is promoted only while its mark holds the key",
    () =>
      Effect.gen(function* () {
        const spend = { spend: new Set(['modal'] as const) };
        // another build takes the key while the train runs: its run is fenced, so not promoted
        const lost = files();
        const fencedAsked: Array<string> = [];
        const fenced = yield* build(lost, fencedAsked, spend, graph(), {
          training: takeMarks(lost),
        });
        expect(stateOf(fenced)['train']).toBe('failed');
        expect(fencedAsked.filter((a) => a.startsWith('promote'))).toEqual([]);
        // a run that holds its key promotes its own run's checkpoint to the key's
        const asked: Array<string> = [];
        expect(stateOf(yield* build(files(), asked, spend))['train']).toBe('ran');
        const trains = asked.filter((a) => a.startsWith('train')).map(trainOf);
        expect(trains.length).toBe(1);
        const [{ key, run } = { key: '', run: '' }] = trains;
        expect(asked.filter((a) => a.startsWith('promote'))).toEqual([`promote ${key} ${run}`]);
        const [lostRun] = fencedAsked.filter((a) => a.startsWith('train')).map(trainOf);
        expect(lostRun?.key).toBe(key);
        expect(run.length).toBeGreaterThan(0);
        expect(lostRun?.run).not.toBe(run);
      }),
  );

  it.effect(
    'a failed promote keeps the paid train; the next build promotes that run and trains nothing',
    () =>
      Effect.gen(function* () {
        const spend = { spend: new Set(['modal'] as const) };
        const disk = files();
        const asked: Array<string> = [];
        const first = yield* build(disk, asked, spend, graph(), { promoteFails: 'volume busy' });
        expect(stateOf(first)['train']).toBe('ran');
        const [{ key, run } = { key: '', run: '' }] = asked
          .filter((a) => a.startsWith('train'))
          .map(trainOf);
        expect(asked.filter((a) => a.startsWith('promote'))).toEqual([`promote ${key} ${run}`]);
        const unpromoted = (yield* Schema.decodeEffect(Built)(
          new TextDecoder().decode(disk.get('/cache/build.json')),
        )).stages;
        expect(
          Object.values(unpromoted).flatMap((s) =>
            Option.toArray(Option.fromUndefinedOr(s.unpromoted)),
          ),
        ).toEqual([{ run, reason: 'promote: reader promote: volume busy' }]);
        // a plan reads the train cached and asks the reader nothing
        const planned: Array<string> = [];
        const plan = yield* build(disk, planned, { plan: true });
        expect(stateOf(plan)['train']).toBe('cached');
        expect(planned).toEqual([]);
        // the next build promotes the first run, and trains nothing
        const again: Array<string> = [];
        const second = yield* build(disk, again, spend);
        expect(stateOf(second)['train']).toBe('cached');
        expect(again).toEqual([`promote ${key} ${run}`]);
        // once promoted, a build asks nothing
        const third: Array<string> = [];
        yield* build(disk, third, spend);
        expect(third).toEqual([]);
      }),
  );

  it.effect('a change to a reader source file is a new train, and so new evals', () =>
    Effect.gen(function* () {
      const disk = files();
      yield* build(disk, [], { spend: new Set(['modal'] as const) });
      const plan = yield* build(disk, [], { plan: true, touch: ['/reader/model.py'] });
      const state = stateOf(plan);
      expect(state['trainset']).toBe('cached');
      expect(state['train']).toBe('stale');
      expect(state['eval:front@m']).toBe('stale');
    }),
  );

  it.effect('an entry with an open bar or a failing fit row is not trained on', () =>
    Effect.gen(function* () {
      const spend = { spend: new Set(['modal'] as const) };
      const bars: Array<string> = [];
      const open = files();
      open.set(recordFile('side'), record('open'));
      yield* build(open, bars, spend);
      expect(bars.filter((a) => a.startsWith('train'))).toEqual([
        expect.stringMatching(/ shards=1$/),
      ]);
      const missing: Array<string> = [];
      const none = files();
      none.set(recordFile('side'), text('none'));
      yield* build(none, missing, spend);
      expect(missing.filter((a) => a.startsWith('train'))).toEqual([
        expect.stringMatching(/ shards=1$/),
      ]);
      const fit: Array<string> = [];
      yield* build(files(), fit, spend, graph({ failing: 'm/side' }));
      expect(fit.filter((a) => a.startsWith('train'))).toEqual([
        expect.stringMatching(/ shards=1$/),
      ]);
    }),
  );

  it.effect("a record's bars that change change the set, the shard and fit bytes the same", () =>
    Effect.gen(function* () {
      const disk = files();
      disk.set(recordFile('side'), record('open'));
      const trained = (asked: ReadonlyArray<string>) => asked.filter((a) => a.startsWith('train'));
      const spend = { spend: new Set(['modal'] as const) };
      const first: Array<string> = [];
      yield* build(disk, first, spend);
      expect(trained(first)).toEqual([expect.stringMatching(/ shards=1$/)]);
      // bars false -> true: the side joins, one more train
      disk.set(recordFile('side'), record('passing'));
      const joined: Array<string> = [];
      yield* build(disk, joined, spend);
      expect(trained(joined)).toEqual([expect.stringMatching(/ shards=2$/)]);
      // and back: the side leaves the set again, which is the first build's set, and its train
      disk.set(recordFile('side'), record('open'));
      const left: Array<string> = [];
      const back = yield* build(disk, left, spend);
      expect(stateOf(back)['trainset']).toBe('cached');
      expect(stateOf(back)['train']).toBe('cached');
      expect(trained(left)).toEqual([]);
    }),
  );

  it.effect(
    'a drawing with no record and open bars at the start, cut in this build, joins its one train',
    () =>
      Effect.gen(function* () {
        const disk = files();
        disk.set(recordFile('side'), text('none'));
        const asked: Array<string> = [];
        const report = yield* build(
          disk,
          asked,
          { spend: new Set(['okra', 'modal'] as const) },
          graph({ sideCut: true }),
        );
        expect(stateOf(report)['parts:side@m']).toBe('ran');
        expect(asked.filter((a) => a.startsWith('train'))).toEqual([
          expect.stringMatching(/ shards=2$/),
        ]);
        // without the okra spend the side waits, and the set trains on the front alone
        const waits: Array<string> = [];
        const held = yield* build(
          files(),
          waits,
          { spend: new Set(['modal'] as const) },
          graph({ sideCut: true }),
        );
        expect(stateOf(held)['renders:side@m']).toBe('waiting-spend');
        expect(waits.filter((a) => a.startsWith('train'))).toEqual([
          expect.stringMatching(/ shards=1$/),
        ]);
      }),
  );

  it.effect("the train config's backbone and input, in its key, are model.py's defaults", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const model = yield* fs.readFileString(
        new URL('../../../reader/model.py', import.meta.url).pathname,
      );
      // the config is the train key's (`graph.ts` keys every stage by its config)
      const train = decodeTrainConfig(trainStage(CANDIDATES, SOURCES).config ?? '');
      expect(train.backbone).toBe('facebook/dinov2-small');
      expect(model).toContain(`BACKBONE = "${train.backbone}"`);
      expect(model).toContain(`IN_W, IN_H = ${train.inputSide.width}, ${train.inputSide.height}`);
    }).pipe(Effect.provide(BunFileSystem.layer)),
  );
});

describe('the live reader', () => {
  /** A spawner that records each command (program and arguments) and exits 0, printing nothing. */
  const recording = (commands: Array<ReadonlyArray<string>>) =>
    ChildProcessSpawner.make((command) => {
      if (command._tag === 'StandardCommand') commands.push([command.command, ...command.args]);
      return Effect.succeed(
        ChildProcessSpawner.makeHandle({
          pid: ChildProcessSpawner.ProcessId(0),
          exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
          isRunning: Effect.succeed(false),
          kill: () => Effect.void,
          stdin: Sink.drain,
          stdout: Stream.empty,
          stderr: Stream.empty,
          all: Stream.empty,
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
          unref: Effect.succeed(Effect.void),
        }),
      );
    });

  /**
   * The live reader over `spawner`, in an environment made for it as the
   * layer finds one: `venv-<uv.lock's hash>/bin/python` under a temporary
   * FILM_READER_HOME.
   */
  const liveOver = (spawner: ChildProcessSpawner.ChildProcessSpawner['Service']) =>
    Layer.unwrap(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const home = yield* fs.makeTempDirectoryScoped();
        const lock = yield* fs.readFile(
          new URL('../../../reader/uv.lock', import.meta.url).pathname,
        );
        const bin = `${home}/venv-${sha256Hex(lock).slice(0, 12)}/bin`;
        yield* fs.makeDirectory(bin, { recursive: true });
        yield* fs.writeFileString(`${bin}/python`, '');
        return CastReader.layer.pipe(
          Layer.provide([
            Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner),
            ConfigProvider.layer(ConfigProvider.fromUnknown({ FILM_READER_HOME: home })),
          ]),
        );
      }),
    ).pipe(Layer.provide([BunFileSystem.layer, BunPath.layer]));

  it.effect("a train hands Modal the config's backbone and input side", () => {
    const commands: Array<ReadonlyArray<string>> = [];
    return Effect.gen(function* () {
      // the recording spawner writes no checkpoint, so the train itself fails after its call
      yield* Effect.exit(
        (yield* CastReader).train({
          trainset: 'set',
          key: 'key',
          run: 'run',
          shards: ['/a.tar'],
          config: {
            steps: 10,
            batch: 2,
            lr: 0.001,
            seed: 0,
            gpu: 'L4',
            precision: 'bf16',
            backbone: 'facebook/dinov2-base',
            inputSide: { width: 896, height: 1120 },
          },
        }),
      );
      const train = commands.find((c) => c.some((a) => a.endsWith('modal_app.py::train')));
      const flag = (name: string) => train?.[train.indexOf(name) + 1];
      expect(flag('--backbone')).toBe('facebook/dinov2-base');
      expect(flag('--input-width')).toBe('896');
      expect(flag('--input-height')).toBe('1120');
    }).pipe(Effect.provide(liveOver(recording(commands))));
  });
});
