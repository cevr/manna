// The train and eval stages over a fake training set, with the reader's live
// layer replaced: no Modal call without `--spend modal`; one train, then
// each drawing's eval, when it is allowed; a rerun asks the reader nothing;
// a change to one of the reader's source files is a new train.

import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';
import { memoryFileSystem, memoryLocks, text } from '../host/testing.ts';
import { ContentStore } from '../content-store.ts';
import { type Stage, buildGraph, fileInput, stageInput } from './graph.ts';
import { CastReader } from './reader.ts';
import {
  TRAIN,
  candidateOf,
  encodeParts,
  evalStage,
  statusStage,
  trainStage,
  trainsetStage,
} from './stages.ts';

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
const CANDIDATES = VIEWS.map((v) => candidateOf(v, 'm'));

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
          run: (ctx: Ctx) => ctx.spend('okra', encodeParts({ files: [], record: RECORD.passing })),
        },
      ].filter(() => cutInBuild),
      ...[
        {
          id: at('parts'),
          inputs: [stageInput(at('drawing')), fileInput(recordFile(v))],
          version: '1',
          run: (ctx: Ctx) =>
            Effect.flatMap(ctx.file(recordFile(v)), (bytes) =>
              encodeParts(
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
      statusStage(v, 'm'),
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
  training: Effect.Effect<void> = Effect.void,
) =>
  buildGraph(stages, options(over)).pipe(
    Effect.provide(
      Layer.mergeAll(
        ContentStore.layer.pipe(
          Layer.provideMerge([memoryFileSystem(disk), Path.layer, memoryLocks]),
        ),
        CastReader.layerTest({ evaluate: '{"seen":{"accuracy":1}}', training }, asked, SOURCES),
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
        const fenced = yield* build(lost, fencedAsked, spend, graph(), takeMarks(lost));
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

  it.effect('the train config names the backbone and input model.py reads, in its key', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const model = yield* fs.readFileString(
        new URL('../../../reader/model.py', import.meta.url).pathname,
      );
      expect(model).toContain(`BACKBONE = "${TRAIN.backbone}"`);
      expect(model).toContain(`IN_W, IN_H = ${TRAIN.inputSide.width}, ${TRAIN.inputSide.height}`);
      // the config is the train key's (`graph.ts` keys every stage by its config)
      expect(trainStage(CANDIDATES, SOURCES).config).toContain(TRAIN.backbone);
      expect(trainStage(CANDIDATES, SOURCES).config).toContain('"inputSide":{"width":448');
    }).pipe(Effect.provide(BunFileSystem.layer)),
  );
});
