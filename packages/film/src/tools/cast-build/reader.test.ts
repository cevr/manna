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
import { CastReader, importsOf, rolesOf } from './reader.ts';
import { candidatesOf, evalStage, memberStages, trainStage, trainsetStage } from './stages.ts';

/** What a build is asked with, as `buildGraph` takes it. */
type BuildOptions = Parameters<typeof buildGraph>[1];

const options = (over: Partial<BuildOptions> = {}): BuildOptions => ({
  root: '/',
  cache: '/cache',
  plan: false,
  touch: [],
  spend: new Set(),
  ...over,
});

const SOURCES = ['/reader/model.py', '/reader/uv.lock'];
/** The committed reader lock the train adopts from. */
const LOCK = '/library/reader.lock.json';
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
/** The fit rows a view's fit stage reads off disk, so a test flips them on one cache. */
const fitFile = (view: string) => `/in/${view}.fit.json`;

/**
 * Each view's drawing, parts (its record file read off disk, `none` for no
 * record), cut, fit (its rows read off disk), renders (a shard
 * file's bytes) and status stages, the training set, its train and each
 * drawing's eval. When `sideCut` is on, the side's parts stage spends okra
 * and writes a passing record: the side is cut in the build.
 */
const graph = (o: { readonly sideCut?: boolean } = {}): ReadonlyArray<Stage<CastReader>> => [
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
        inputs: [stageInput(at('cut')), fileInput(fitFile(v))],
        version: '1',
        run: (ctx: Ctx) => ctx.file(fitFile(v)),
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
  trainStage(CANDIDATES, SOURCES, LOCK),
  ...CANDIDATES.map((c) => evalStage(c.renders, [])),
];

const files = () =>
  new Map<string, Uint8Array>([
    ['/in/renders:front@m.tar', text('front shard')],
    ['/in/renders:side@m.tar', text('side shard')],
    [recordFile('front'), record('passing')],
    [recordFile('side'), record('passing')],
    [fitFile('front'), fitRows(true)],
    [fitFile('side'), fitRows(true)],
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
        CastReader.layerTest({ evaluate: () => '{"seen":{"accuracy":1}}', ...reader }, asked, {
          train: SOURCES,
          read: SOURCES,
          eval: SOURCES,
        }),
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

  it.effect('an entry missing only its bars, or with no record, joins the set it trains on', () =>
    Effect.gen(function* () {
      const spend = { spend: new Set(['modal'] as const) };
      const bars: Array<string> = [];
      const open = files();
      open.set(recordFile('side'), record('open'));
      yield* build(open, bars, spend);
      expect(bars.filter((a) => a.startsWith('train'))).toEqual([
        expect.stringMatching(/ shards=2$/),
      ]);
      const missing: Array<string> = [];
      const none = files();
      none.set(recordFile('side'), text('none'));
      yield* build(none, missing, spend);
      expect(missing.filter((a) => a.startsWith('train'))).toEqual([
        expect.stringMatching(/ shards=2$/),
      ]);
    }),
  );

  it.effect('an entry with a failing fit row is not trained on, its bars passed or not', () =>
    Effect.gen(function* () {
      const spend = { spend: new Set(['modal'] as const) };
      for (const bars of ['passing', 'open'] as const) {
        const asked: Array<string> = [];
        const disk = files();
        disk.set(recordFile('side'), record(bars));
        disk.set(fitFile('side'), fitRows(false));
        yield* build(disk, asked, spend);
        expect(asked.filter((a) => a.startsWith('train'))).toEqual([
          expect.stringMatching(/ shards=1$/),
        ]);
      }
    }),
  );

  it.effect('a fit that flips flips the entry in the set on one cache, its pixels the same', () =>
    Effect.gen(function* () {
      // the side's bars stay open throughout: only its trainable verdict flips
      const disk = files();
      disk.set(recordFile('side'), record('open'));
      disk.set(fitFile('side'), fitRows(false));
      const trained = (asked: ReadonlyArray<string>) => asked.filter((a) => a.startsWith('train'));
      const spend = { spend: new Set(['modal'] as const) };
      const first: Array<string> = [];
      yield* build(disk, first, spend);
      expect(trained(first)).toEqual([expect.stringMatching(/ shards=1$/)]);
      // fit false -> true: the side's status says trainable, and it joins, its renders cached
      disk.set(fitFile('side'), fitRows(true));
      const joined: Array<string> = [];
      const join = yield* build(disk, joined, spend);
      expect(stateOf(join)['renders:side@m']).toBe('cached');
      expect(stateOf(join)['status:side@m']).toBe('ran');
      expect(trained(joined)).toEqual([expect.stringMatching(/ shards=2$/)]);
      // and back: the side leaves the set again, which is the first build's set, and its train
      disk.set(fitFile('side'), fitRows(false));
      const left: Array<string> = [];
      const back = yield* build(disk, left, spend);
      expect(stateOf(back)['trainset']).toBe('cached');
      expect(stateOf(back)['train']).toBe('cached');
      expect(trained(left)).toEqual([]);
    }),
  );

  it.effect("a record's bars that change change the entry's status, not the set or its train", () =>
    Effect.gen(function* () {
      const disk = files();
      const spend = { spend: new Set(['modal'] as const) };
      const first: Array<string> = [];
      yield* build(disk, first, spend);
      expect(first.filter((a) => a.startsWith('train'))).toEqual([
        expect.stringMatching(/ shards=2$/),
      ]);
      disk.set(recordFile('side'), record('open'));
      const again: Array<string> = [];
      const opened = yield* build(disk, again, spend);
      expect(stateOf(opened)['status:side@m']).toBe('ran');
      expect(stateOf(opened)['train']).toBe('cached');
      expect(again).toEqual([]);
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
      const train = decodeTrainConfig(trainStage(CANDIDATES, SOURCES, LOCK).config ?? '');
      expect(train.backbone).toBe('facebook/dinov2-small');
      expect(model).toContain(`BACKBONE = "${train.backbone}"`);
      expect(model).toContain(`IN_W, IN_H = ${train.inputSide.width}, ${train.inputSide.height}`);
    }).pipe(Effect.provide(BunFileSystem.layer)),
  );
});

describe('cast build: the train adopts the committed checkpoint', () => {
  const jsonOf = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
  /** The fake reader's checkpoint, as `layerTest` makes it. */
  const CHECKPOINT = sha256Hex(new Uint8Array([1]));
  /**
   * A cache trained once with `--spend modal`, then rekeyed (its `build.json`
   * dropped, its objects kept: every stage key new, as a change of key form
   * makes it), and a committed lock naming `reader` (the train's reader key
   * when `undefined`) and the checkpoint.
   */
  const rekeyed = (reader?: string) =>
    Effect.gen(function* () {
      const disk = files();
      const asked: Array<string> = [];
      yield* build(disk, asked, { spend: new Set(['modal'] as const) });
      const [{ key } = { key: '' }] = asked.filter((a) => a.startsWith('train')).map(trainOf);
      disk.delete('/cache/build.json');
      disk.set(
        LOCK,
        text(
          jsonOf({
            reader: reader ?? key,
            checkpointSha256: CHECKPOINT,
            train: { stageSec: 4361 },
          }),
        ),
      );
      return disk;
    });

  it.effect(
    "with no spend, a train whose reader key is the lock's and whose checkpoint is cached adopts it: no train, no promote",
    () =>
      Effect.gen(function* () {
        const disk = yield* rekeyed();
        const asked: Array<string> = [];
        const report = yield* build(disk, asked);
        expect(stateOf(report)['train']).toBe('ran');
        expect(report.modalCalls).toBe(0);
        expect(report.spendUsd).toBe(0);
        expect(asked.filter((a) => a.startsWith('train') || a.startsWith('promote'))).toEqual([]);
        // its evals read the adopted checkpoint
        expect(stateOf(report)['eval:front@m']).toBe('ran');
        // and a plan after it reads the train cached
        const plan = yield* build(disk, [], { plan: true });
        expect(stateOf(plan)['train']).toBe('cached');
      }),
  );

  it.effect('a cached checkpoint whose bytes do not hash to its name is not adopted', () =>
    Effect.gen(function* () {
      const disk = yield* rekeyed();
      disk.set(`/cache/objects/${CHECKPOINT}`, text('torn'));
      const asked: Array<string> = [];
      const report = yield* build(disk, asked);
      expect(stateOf(report)['train']).toBe('waiting-spend');
      expect(asked).toEqual([]);
    }),
  );

  it.effect('a lock naming another reader key is not adopted', () =>
    Effect.gen(function* () {
      const disk = yield* rekeyed('0'.repeat(64));
      const asked: Array<string> = [];
      const report = yield* build(disk, asked);
      expect(stateOf(report)['train']).toBe('waiting-spend');
      expect(asked).toEqual([]);
    }),
  );
});

describe("the reader's roles, derived from its imports", () => {
  /** A reader folder shaped as the committed one: modal_app.py imports train and model inside its functions. */
  const FOLDER: ReadonlyArray<readonly [string, string]> = [
    ['eval.py', 'import argparse\nimport numpy as np\n\nfrom model import BONES, wrap\n'],
    [
      'modal_app.py',
      [
        'import json',
        'import modal',
        'def fit():',
        '    import sys',
        '    from train import train as run',
        'def read():',
        '    from model import Frame',
      ].join('\n'),
    ],
    [
      'model.py',
      'import torch\n\nclass Reader:\n    def load(self):\n        from transformers import AutoModel\n',
    ],
    ['read.py', 'import cv2\nfrom model import CANVAS, decode\n'],
    ['train.py', 'import torch.nn.functional as F\nfrom model import BACKBONE, Reader\n'],
  ];
  const rolesIn = (over: ReadonlyArray<readonly [string, string]> = []) =>
    rolesOf(new Map([...FOLDER, ...over]));

  it.effect('a role is its entries’ closure, a local role with the environment', () =>
    Effect.gen(function* () {
      expect(yield* rolesIn()).toEqual({
        train: ['modal_app.py', 'model.py', 'train.py'],
        read: ['model.py', 'pyproject.toml', 'read.py', 'uv.lock'],
        eval: ['eval.py', 'model.py', 'pyproject.toml', 'read.py', 'uv.lock'],
      });
    }),
  );

  it.effect('the closure is transitive, and a module with no file in the folder is no edge', () =>
    Effect.gen(function* () {
      const roles = yield* rolesIn([
        ['read.py', 'import numpy\nfrom model import decode\nimport a\n'],
        ['a.py', 'import os\nimport b\n'],
        ['b.py', 'from c import x\n'],
        ['c.py', 'import torch\n'],
        ['unused.py', 'import model\n'],
      ]);
      expect(roles.read).toEqual([
        'a.py',
        'b.py',
        'c.py',
        'model.py',
        'pyproject.toml',
        'read.py',
        'uv.lock',
      ]);
      expect(roles.train).toEqual(['modal_app.py', 'model.py', 'train.py']);
    }),
  );

  it.effect('reads every import form, each by its first name', () =>
    Effect.sync(() => {
      const forms: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
        ['import a, b as c', ['a', 'b']],
        ['import x as y', ['x']],
        ['import pkg.sub', ['pkg']],
        ['    from inner import thing', ['inner']],
        ['from multi import (\n    one,\n    two,\n)', ['multi']],
        ['from .rel import x', ['rel']],
        ['from . import (\n    left,\n    right as r,\n)', ['left', 'right']],
        ['import first, \\\n    second', ['first', 'second']],
        ['x = 1; import semi', ['semi']],
        ['# import commented', []],
        ['print("import nothing")', []],
      ];
      for (const [source, names] of forms)
        expect([source, importsOf(source)]).toEqual([source, names]);
    }),
  );

  it.effect('an import-like line in a string widens the closure, which only widens its key', () =>
    Effect.gen(function* () {
      const roles = yield* rolesIn([
        ['read.py', 'from model import decode\n"""\nimport helper\n"""\n'],
        ['helper.py', ''],
      ]);
      expect(roles.read).toContain('helper.py');
    }),
  );

  it.effect('a file that imports dynamically fails the scan, by its name and the word', () =>
    Effect.gen(function* () {
      for (const word of [
        'importlib.import_module("x")',
        '__import__("x")',
        'runpy.run_path("x")',
      ]) {
        const failed = yield* Effect.flip(rolesIn([['stray.py', word]]));
        expect(failed._tag).toBe('ReaderScanFailed');
        expect(failed.file).toBe('stray.py');
        expect(failed.message).toContain(word.split(/[.(]/)[0] ?? '');
      }
    }),
  );

  it.effect('a missing entry fails the scan, naming its role', () =>
    Effect.gen(function* () {
      const failed = yield* Effect.flip(
        rolesOf(new Map(FOLDER.filter(([name]) => name !== 'eval.py'))),
      );
      expect(failed.file).toBe('eval.py');
      expect(failed.reason).toContain('eval');
    }),
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

  /** A reader folder of the live layer's: its entry scripts, its model and its lock, written to a temporary folder. */
  const FOLDER = {
    'eval.py': 'from model import BONES\n',
    'modal_app.py': 'def fit():\n    from train import train\n',
    'model.py': 'import torch\n',
    'read.py': 'from model import decode\n',
    'train.py': 'from model import Reader\n',
    'pyproject.toml': '[project]\n',
    'uv.lock': 'version = 1\n',
  };

  /**
   * The live reader over `spawner`, of a reader folder written to a
   * temporary folder (`reader`), in an environment made for it as the layer
   * finds one: `venv-<uv.lock's hash>/bin/python` under a temporary
   * FILM_READER_HOME.
   */
  const liveOver = (
    spawner: ChildProcessSpawner.ChildProcessSpawner['Service'],
    reader: Array<string> = [],
  ) =>
    Layer.unwrap(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const home = yield* fs.makeTempDirectoryScoped();
        const folder = yield* fs.makeTempDirectoryScoped();
        for (const [name, body] of Object.entries(FOLDER))
          yield* fs.writeFileString(`${folder}/${name}`, body);
        reader.push(folder);
        const bin = `${home}/venv-${sha256Hex(text(FOLDER['uv.lock'])).slice(0, 12)}/bin`;
        yield* fs.makeDirectory(bin, { recursive: true });
        yield* fs.writeFileString(`${bin}/python`, '');
        return CastReader.layerIn(folder).pipe(
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

  it.effect("its sources are its folder's roles, as absolute paths", () => {
    const folder: Array<string> = [];
    return Effect.gen(function* () {
      const { sources } = yield* CastReader;
      const [dir = ''] = folder;
      const at = (names: ReadonlyArray<string>) => names.map((n) => `${dir}/${n}`);
      expect(sources).toEqual({
        train: at(['modal_app.py', 'model.py', 'train.py']),
        read: at(['model.py', 'pyproject.toml', 'read.py', 'uv.lock']),
        eval: at(['eval.py', 'model.py', 'pyproject.toml', 'read.py', 'uv.lock']),
      });
    }).pipe(Effect.provide(liveOver(recording([]), folder)));
  });
});
