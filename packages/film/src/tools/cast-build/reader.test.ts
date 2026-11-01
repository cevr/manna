// The train and eval stages over a fake training set, with the reader's live
// layer replaced: no Modal call without `--spend modal`; one train, then
// each drawing's eval, when it is allowed; a rerun asks the reader nothing;
// a change to one of the reader's source files is a new train. Every file
// is on an in-memory disk; the committed folder is read in
// reader.slow.test.ts.

import { describe, expect, it } from 'effect-bun-test';
import {
  ConfigProvider,
  Effect,
  type FileSystem,
  Layer,
  Logger,
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
import {
  candidatesOf,
  evalStage,
  memberStages,
  readsDirOf,
  TRAIN,
  trainStage,
  trainsetStage,
} from './stages.ts';

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

/** The reader's files by role, as `CastReader.sources` names them: model.py trains and reads; read.py, eval.py and the lock only read. */
const ROLES = {
  train: ['/reader/model.py'],
  read: ['/reader/model.py', '/reader/read.py', '/reader/uv.lock'],
  eval: ['/reader/eval.py', '/reader/model.py', '/reader/read.py', '/reader/uv.lock'],
};
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
const graph = (
  o: {
    readonly sideCut?: boolean;
    readonly keepReader?: boolean;
    /** The train files, `ROLES.train` unless named. */
    readonly train?: ReadonlyArray<string>;
  } = {},
): ReadonlyArray<Stage<CastReader | FileSystem.FileSystem>> => [
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
  trainStage(CANDIDATES, o.train ?? ROLES.train, LOCK, { keepReader: o.keepReader === true }),
  ...CANDIDATES.map((c) => evalStage(c.renders, [], ROLES.eval)),
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
    ['/reader/read.py', text('read')],
    ['/reader/eval.py', text('eval')],
    ['/reader/uv.lock', text('lock')],
  ]);

const build = (
  disk: Map<string, Uint8Array>,
  asked: Array<string>,
  over: Partial<BuildOptions> = {},
  stages: ReadonlyArray<Stage<CastReader | FileSystem.FileSystem>> = graph(),
  reader: {
    readonly training?: Effect.Effect<void>;
    readonly promoteFails?: string;
    readonly evaluate?: (shard: string) => string;
  } = {},
) =>
  buildGraph(stages, options(over)).pipe(
    Effect.provide(
      Layer.mergeAll(
        ContentStore.layer.pipe(
          Layer.provideMerge([memoryFileSystem(disk), Path.layer, memoryLocks]),
        ),
        CastReader.layerTest(
          { evaluate: () => '{"seen":{"accuracy":1}}', ...reader },
          asked,
          ROLES,
        ),
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

  it.effect('a change to a train file is a new train, and so new evals', () =>
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

  it.effect(
    'a change to a file only a read or an eval runs leaves the train cached and re-runs every eval',
    () =>
      Effect.gen(function* () {
        const disk = files();
        yield* build(disk, [], { spend: new Set(['modal'] as const) });
        for (const file of ['/reader/read.py', '/reader/eval.py', '/reader/uv.lock']) {
          const state = stateOf(yield* build(disk, [], { plan: true, touch: [file] }));
          expect([file, state['train'], state['eval:front@m'], state['eval:side@m']]).toEqual([
            file,
            'cached',
            'stale',
            'stale',
          ]);
        }
      }),
  );

  it.effect(
    "a clip's read is kept by the read files' hashes: a read edit misses it, a train-only edit does not",
    () => {
      const disk = new Map([
        ['/ckpt.pt', text('ckpt')],
        ['/clip.mp4', text('clip')],
        ['/reader/model.py', text('model')],
        ['/reader/read.py', text('read')],
        ['/reader/uv.lock', text('lock')],
        ['/reader/train.py', text('train')],
      ]);
      const dirOf = readsDirOf({
        ckpt: '/ckpt.pt',
        clip: '/clip.mp4',
        map: { x0: 0, y0: 0, scale: 1 },
        cache: '/cache',
      });
      return Effect.gen(function* () {
        const first = yield* dirOf;
        expect(first).toMatch(/^\/cache\/reads\/[0-9a-f]{64}$/);
        disk.set('/reader/train.py', text('train, edited'));
        expect(yield* dirOf).toBe(first);
        for (const file of ROLES.read) {
          const was = disk.get(file) ?? text('');
          disk.set(file, text(`${file}, edited`));
          expect([file, (yield* dirOf) === first]).toEqual([file, false]);
          disk.set(file, was);
        }
        expect(yield* dirOf).toBe(first);
      }).pipe(
        Effect.provide([
          memoryFileSystem(disk),
          Path.layer,
          CastReader.layerTest({}, [], {
            train: ['/reader/model.py', '/reader/train.py'],
            read: ROLES.read,
            eval: [],
          }),
        ]),
      );
    },
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

describe('cast build: --keep-reader keeps the committed checkpoint across a key change', () => {
  const jsonOf = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
  const spend = { spend: new Set(['modal'] as const) };
  /** The fake reader's checkpoint, as `layerTest` makes it. */
  const CHECKPOINT = sha256Hex(new Uint8Array([1]));
  const SIDE = sha256Hex(text('side shard'));
  /** The fake set's hash: each drawing by its shard's hash, a line each, sorted. */
  const TRAINSET = sha256Hex(
    text([`m/front=${sha256Hex(text('front shard'))}`, `m/side=${SIDE}`].join('\n')),
  );
  /** A held line as the lock keeps it. */
  const LINE = {
    n: 12,
    accuracy: 0.9,
    angleDeg: { median: 3.1, p90: 9.4 },
    jointPx: { median: 2.2, p90: 6.8 },
  };
  /** eval.py's JSON for a held line: its spreads also carry a count and a mean; it writes `null` for the side it has no samples on. */
  const evalJson = (l: typeof LINE) =>
    `{"seen":${jsonOf({
      n: l.n,
      accuracy: l.accuracy,
      angle_deg: { ...l.angleDeg, mean: 4, n: l.n },
      joint_px: { ...l.jointPx, mean: 3, n: l.n },
    })},"unseen":null}`;
  /** `side` for the side's shard, else `front`. */
  const bySide = <A>(shard: string, side: A, front: A) =>
    Option.match(
      Option.liftPredicate(shard, (s) => s.includes(SIDE)),
      { onNone: () => front, onSome: () => side },
    );
  /** Each shard's eval: the lock's line, or `side` for the side's shard. */
  const scores =
    (side: typeof LINE = LINE) =>
    (shard: string) =>
      evalJson(bySide(shard, side, LINE));
  const keep = graph({ keepReader: true });
  const evaluated = (asked: ReadonlyArray<string>) =>
    asked.filter((a) => a.startsWith('evaluate')).length;
  const trainedOrPromoted = (asked: ReadonlyArray<string>) =>
    asked.filter((a) => a.startsWith('train') || a.startsWith('promote'));
  /** The reason the report gives stage `id`, '' for none. */
  const reasonOf = (
    report: { stages: ReadonlyArray<{ id: string; reason: Option.Option<string> }> },
    id: string,
  ) =>
    report.stages
      .filter((s) => s.id === id)
      .flatMap((s) => Option.toArray(s.reason))
      .join('');

  /** What a test sets in the committed lock over the train's own fields. */
  type LockOver = Partial<{
    readonly trainset: string;
    readonly config: Omit<typeof TRAIN, 'steps'> & { readonly steps: number };
    readonly held: {
      readonly drawings: number;
      readonly accuracy: number;
      readonly byDrawing: Readonly<Record<string, typeof LINE>>;
    };
  }>;

  /**
   * A cache trained once with `--spend modal`, and a committed lock naming
   * that train: its key, train files, set, config, checkpoint and held lines
   * (`over` on top). Then, unless `edit` is off, model.py edited: the reader
   * key moved.
   */
  const moved = (over: LockOver = {}, edit = true) =>
    Effect.gen(function* () {
      const disk = files();
      const asked: Array<string> = [];
      yield* build(disk, asked, spend, graph(), { evaluate: scores() });
      const [{ key } = { key: '' }] = asked.filter((a) => a.startsWith('train')).map(trainOf);
      disk.set(
        LOCK,
        text(
          jsonOf({
            reader: key,
            trainer: { 'model.py': sha256Hex(text('model')) },
            trainset: TRAINSET,
            config: TRAIN,
            checkpointSha256: CHECKPOINT,
            train: { stageSec: 4361 },
            held: { drawings: 2, accuracy: 0.9, byDrawing: { 'm/front': LINE, 'm/side': LINE } },
            ...over,
          }),
        ),
      );
      if (edit) disk.set('/reader/model.py', text('model, a comment added'));
      return disk;
    });

  it.effect(
    "it adopts once every held drawing reads exactly the lock's line: no train, no promote, no spend",
    () =>
      Effect.gen(function* () {
        const disk = yield* moved();
        const asked: Array<string> = [];
        const report = yield* build(disk, asked, spend, keep, { evaluate: scores() });
        expect(stateOf(report)['train']).toBe('ran');
        expect(report.modalCalls).toBe(0);
        expect(report.spendUsd).toBe(0);
        expect(trainedOrPromoted(asked)).toEqual([]);
        // the train read both held drawings, then each eval stage its own
        expect(evaluated(asked)).toBe(4);
        expect(stateOf(report)['eval:side@m']).toBe('ran');
        // the flag is in no key: a plan after it, with or without it, reads the train cached
        expect(stateOf(yield* build(disk, [], { plan: true }, keep))['train']).toBe('cached');
        expect(stateOf(yield* build(disk, [], { plan: true }))['train']).toBe('cached');
      }),
  );

  it.effect(
    'a drawing that reads otherwise fails the train, naming it and its field; it trains nothing and is not cached',
    () =>
      Effect.gen(function* () {
        const disk = yield* moved();
        const asked: Array<string> = [];
        const off = { ...LINE, jointPx: { median: 2.2, p90: 6.9 } };
        const report = yield* build(disk, asked, spend, keep, { evaluate: scores(off) });
        expect(stateOf(report)['train']).toBe('failed');
        const reason = reasonOf(report, 'train');
        expect(reason).toContain('m/side jointPx.p90 6.8 -> 6.9');
        expect(reason).not.toContain('m/front');
        expect(trainedOrPromoted(asked)).toEqual([]);
        expect(report.modalCalls).toBe(0);
        expect(evaluated(asked)).toBe(2);
        // not cached: the next plan reads the train stale, and an equal read adopts
        expect(stateOf(yield* build(disk, [], { plan: true }, keep))['train']).toBe('stale');
        const again = yield* build(disk, [], {}, keep, { evaluate: scores() });
        expect(stateOf(again)['train']).toBe('ran');
      }),
  );

  it.effect(
    'every field of every held drawing is compared: one field off in either drawing refuses',
    () =>
      Effect.gen(function* () {
        const fields: ReadonlyArray<readonly [string, typeof LINE]> = [
          ['n', { ...LINE, n: 13 }],
          ['accuracy', { ...LINE, accuracy: 0.91 }],
          ['angleDeg.median', { ...LINE, angleDeg: { median: 3.2, p90: 9.4 } }],
          ['angleDeg.p90', { ...LINE, angleDeg: { median: 3.1, p90: 9.5 } }],
          ['jointPx.median', { ...LINE, jointPx: { median: 2.3, p90: 6.8 } }],
          ['jointPx.p90', { ...LINE, jointPx: { median: 2.2, p90: 6.9 } }],
        ];
        for (const [field, off] of fields) {
          const report = yield* build(yield* moved(), [], {}, keep, { evaluate: scores(off) });
          expect([field, stateOf(report)['train'], reasonOf(report, 'train')]).toEqual([
            field,
            'failed',
            expect.stringContaining(`m/side ${field} `),
          ]);
        }
        // the front, first in order, refuses too
        const front = yield* build(yield* moved(), [], {}, keep, {
          evaluate: (shard) => evalJson(bySide(shard, LINE, { ...LINE, n: 1 })),
        });
        expect(reasonOf(front, 'train')).toContain('m/front n 12 -> 1');
        // a drawing the eval finds no held samples for refuses
        const none = yield* build(yield* moved(), [], {}, keep, {
          evaluate: (shard) => bySide(shard, '{"seen":null}', evalJson(LINE)),
        });
        expect(reasonOf(none, 'train')).toContain('m/side no held samples');
      }),
  );

  it.effect(
    "a set, config or held set not the lock's, a missing checkpoint or lock: it fails, naming which, and reads nothing",
    () =>
      Effect.gen(function* () {
        const cases: ReadonlyArray<readonly [string, ReturnType<typeof moved>]> = [
          ['the training set changed', moved({ trainset: '0'.repeat(64) })],
          ["the train config is not the lock's", moved({ config: { ...TRAIN, steps: 1 } })],
          [
            "the lock's held drawings are not the training set's",
            moved({ held: { drawings: 1, accuracy: 0.9, byDrawing: { 'm/front': LINE } } }),
          ],
          [
            `the checkpoint ${CHECKPOINT} is not in the cache`,
            Effect.map(moved(), (disk) => {
              disk.delete(`/cache/objects/${CHECKPOINT}`);
              return disk;
            }),
          ],
          [
            `no committed lock at ${LOCK}`,
            Effect.map(moved(), (disk) => {
              disk.delete(LOCK);
              return disk;
            }),
          ],
        ];
        for (const [why, made] of cases) {
          const asked: Array<string> = [];
          const report = yield* build(yield* made, asked, spend, keep, { evaluate: scores() });
          expect([why, stateOf(report)['train'], reasonOf(report, 'train'), asked]).toEqual([
            why,
            'failed',
            expect.stringContaining(why),
            [],
          ]);
        }
      }),
  );

  it.effect(
    'without the flag a moved key never adopts, though every held line would read the same; it logs what changed',
    () => {
      const lines: Array<string> = [];
      // the rekeyed line kept, every other line dropped
      const logged = Logger.layer([
        Logger.make(({ message }) => {
          const line = [message].flat().join(' ');
          if (line.startsWith('cast.build.train rekeyed')) lines.push(line);
        }),
      ]);
      return Effect.gen(function* () {
        const disk = yield* moved();
        lines.length = 0;
        const asked: Array<string> = [];
        const report = yield* build(disk, asked, {}, graph(), { evaluate: scores() });
        expect(stateOf(report)['train']).toBe('waiting-spend');
        expect(asked).toEqual([]);
        expect(lines).toEqual([expect.stringMatching(/ changed=model\.py: .*--keep-reader/)]);
      }).pipe(Effect.provide(logged));
    },
  );

  it.effect(
    "with the lock's key the flag changes nothing: it adopts and reads no held drawing",
    () =>
      Effect.gen(function* () {
        const disk = yield* moved({}, false);
        disk.delete('/cache/build.json');
        const asked: Array<string> = [];
        const report = yield* build(disk, asked, {}, keep, { evaluate: scores() });
        expect(stateOf(report)['train']).toBe('ran');
        expect(trainedOrPromoted(asked)).toEqual([]);
        // only the two eval stages read
        expect(evaluated(asked)).toBe(2);
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

  it.effect('reads every import form, wherever a statement starts, each by its first name', () =>
    Effect.gen(function* () {
      const forms: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
        ['import a, b as c', ['a', 'b']],
        ['import x as y', ['x']],
        ['import pkg.sub', ['pkg']],
        ['    from inner import thing', ['inner']],
        ['from multi import (\n    one,\n    two,\n)', ['multi']],
        ['from pkg.sub import x', ['pkg']],
        ['from star import *', ['star']],
        ['from .rel import x', ['rel']],
        ['from.rel import x', ['rel']],
        ['from . import (\n    left,\n    right as r,\n)', ['left', 'right']],
        ['import first, \\\n    second', ['first', 'second']],
        ['x = 1; import semi', ['semi']],
        ['if True: import suite', ['suite']],
        ['def load(): from helper import VALUE', ['helper']],
        ['try: import a\nexcept ImportError: import b', ['a', 'b']],
        ['if n := len(xs): import walrus', ['walrus']],
        ['# import commented', []],
        ['print("import nothing")', []],
        ["s = 'it\\'s'; import escaped", ['escaped']],
        ['s = r"\\\\"; import raw', ['raw']],
        ['s = f"{d["k"]:>{w}} {{import x}}"; import nested', ['nested']],
        ['"""\nimport in_a_docstring\n"""\nimport after', ['after']],
        ['x = [\n    1,  # a comment\n]\nimport later', ['later']],
        ['s = f"{x:{\'>\'}3}"; import spec_field', ['spec_field']],
        ["s = f\"{ {'k': 1}['k']:>3} {d[1:2]!r:^{w}}\"; import brackets", ['brackets']],
        ['s = f"""{x # a comment\'s quote\n}"""; import field_comment', ['field_comment']],
      ];
      for (const [source, names] of forms)
        expect([source, yield* importsOf('f.py', source)]).toEqual([source, [...names]]);
    }),
  );

  it.effect(
    'a string or a comment that reads as an import is no edge, and never hides the import after it',
    () =>
      Effect.gen(function* () {
        const roles = yield* rolesIn([
          ['read.py', 'from model import decode\n"""\nimport helper\n"""\n# import other\n'],
          ['helper.py', ''],
          ['other.py', ''],
        ]);
        expect(roles.read).not.toContain('helper.py');
        expect(roles.read).not.toContain('other.py');
      }),
  );

  it.effect(
    'the scan fails closed: an import keyword it cannot place, an import it cannot read, a string that does not end, or a quote in a format spec',
    () =>
      Effect.gen(function* () {
        const cases: ReadonlyArray<readonly [string, string]> = [
          ['import model\nx = 1 import helper\n', 'line 2: `import` in code'],
          ['import model\nfrom helper import a,\n', 'line 2: an import the scan cannot read'],
          ['import model\nfrom . import *\n', 'line 2: an import the scan cannot read'],
          ["import model\n'it ends nowhere\nimport helper\n", 'line 2: a string that does not end'],
          [
            's = f"{x:\'>10}"\nimport helper\n',
            "line 1: a quote in a formatted string's format spec",
          ],
          [
            'a = f"{x:\'>3}"; import helper; b = f"{y:\'<3}"\n',
            "line 1: a quote in a formatted string's format spec",
          ],
          [
            "import model\nx = f\"{x:'''}\"\nimport helper\nf\"{x:'''}\"\n",
            "line 2: a quote in a formatted string's format spec",
          ],
          [
            'import model\ns = f"{x:{y:\'<\'}}"\nimport helper\nf"{y:{z:\'>\'}}"\n',
            "line 2: a quote in a formatted string's format spec",
          ],
        ];
        for (const [source, reason] of cases) {
          const failed = yield* Effect.flip(rolesIn([['read.py', source]]));
          expect([source, failed._tag, failed.file, failed.reason]).toEqual([
            source,
            'ReaderScanFailed',
            'read.py',
            expect.stringContaining(reason),
          ]);
        }
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

  /**
   * The folder with `over`, scanned, and on a disk with the build's other
   * files: each `.py` at `/reader/<name>`, the roles as paths there.
   */
  const scannedOver = (over: ReadonlyArray<readonly [string, string]>) =>
    Effect.gen(function* () {
      const folder = new Map([...FOLDER, ['helper.py', 'VALUE = 1\n'] as const, ...over]);
      const roles = yield* rolesOf(folder);
      const at = (names: ReadonlyArray<string>) => names.map((n) => `/reader/${n}`);
      const disk = files();
      for (const [name, body] of folder) disk.set(`/reader/${name}`, text(body));
      disk.set('/reader/pyproject.toml', text('[project]\n'));
      disk.set('/ckpt.pt', text('ckpt'));
      disk.set('/clip.mp4', text('clip'));
      return {
        roles,
        disk,
        sources: { train: at(roles.train), read: at(roles.read), eval: at(roles.eval) },
      };
    });
  const editHelper = (disk: Map<string, Uint8Array>) =>
    disk.set('/reader/helper.py', text('VALUE = 2\n'));

  // review r1 M1: a string or a comment once swallowed the import after it
  for (const [name, source] of [
    [
      'after a docstring that reads as an open import',
      '"""\nfrom example import (\n"""\nimport helper\n',
    ],
    [
      'after a comment that ends in a backslash',
      'from model import decode\n# a comment ending in a backslash \\\nimport helper\n',
    ],
  ] as const)
    it.effect(
      `an import ${name} is in the read closure, and its edit misses the clip read cache`,
      () => {
        const { roles, disk, sources } = Effect.runSync(scannedOver([['read.py', source]]));
        const dirOf = readsDirOf({
          ckpt: '/ckpt.pt',
          clip: '/clip.mp4',
          map: { x0: 0, y0: 0, scale: 1 },
          cache: '/cache',
        });
        return Effect.gen(function* () {
          expect(roles.read).toContain('helper.py');
          const first = yield* dirOf;
          editHelper(disk);
          expect(yield* dirOf).not.toBe(first);
        }).pipe(
          Effect.provide([
            memoryFileSystem(disk),
            Path.layer,
            CastReader.layerTest({}, [], sources),
          ]),
        );
      },
    );

  // review r1 M2: an import in a one-line suite was once no edge, so a training helper's edit kept the old checkpoint
  for (const [name, source] of [
    ['in a one-line if', 'from model import Reader\nif True: import helper\n'],
    ['in a one-line def', 'from model import Reader\ndef load(): from helper import VALUE\n'],
  ] as const)
    it.effect(`an import ${name} is in the train closure, and its edit is a new train key`, () =>
      Effect.gen(function* () {
        const { roles, disk, sources } = yield* scannedOver([['train.py', source]]);
        expect(roles.train).toEqual(['helper.py', 'modal_app.py', 'model.py', 'train.py']);
        const spend = { spend: new Set(['modal'] as const) };
        const asked: Array<string> = [];
        const stages = graph({ train: sources.train });
        yield* build(disk, asked, spend, stages);
        editHelper(disk);
        const plan = yield* build(disk, [], { plan: true }, stages);
        expect(stateOf(plan)['train']).toBe('stale');
        yield* build(disk, asked, spend, stages);
        const keys = asked.filter((a) => a.startsWith('train')).map((a) => trainOf(a).key);
        expect(keys.length).toBe(2);
        expect(keys[0]).not.toBe(keys[1]);
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

  /** A reader folder of the live layer's: its entry scripts, its model, a helper in a one-line suite, and its lock. */
  const FOLDER = {
    'eval.py': 'from model import BONES\n',
    'helper.py': '',
    'modal_app.py': 'def fit():\n    from train import train\n',
    'model.py': 'import torch\n',
    'read.py': 'from model import decode\n',
    'train.py': 'from model import Reader\nif True: import helper\n',
    'pyproject.toml': '[project]\n',
    'uv.lock': 'version = 1\n',
  };
  /** Where the folder and the reader's home lie, on the in-memory disk. */
  const DIR = '/reader';
  const HOME = '/reader-home';

  /**
   * The live reader over `spawner`, of the folder on an in-memory disk, in
   * an environment made for it as the layer finds one: `venv-<uv.lock's
   * hash>/bin/python` under FILM_READER_HOME.
   */
  const liveOver = (spawner: ChildProcessSpawner.ChildProcessSpawner['Service']) => {
    const disk = new Map(
      Object.entries(FOLDER).map(([name, body]) => [`${DIR}/${name}`, text(body)]),
    );
    disk.set(
      `${HOME}/venv-${sha256Hex(text(FOLDER['uv.lock'])).slice(0, 12)}/bin/python`,
      text(''),
    );
    return CastReader.layerIn(DIR).pipe(
      Layer.provide([
        Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner),
        ConfigProvider.layer(ConfigProvider.fromUnknown({ FILM_READER_HOME: HOME })),
        memoryFileSystem(disk),
        Path.layer,
      ]),
    );
  };

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

  it.effect("its sources are its folder's roles, as absolute paths", () =>
    Effect.gen(function* () {
      const { sources } = yield* CastReader;
      const at = (names: ReadonlyArray<string>) => names.map((n) => `${DIR}/${n}`);
      expect(sources).toEqual({
        train: at(['helper.py', 'modal_app.py', 'model.py', 'train.py']),
        read: at(['model.py', 'pyproject.toml', 'read.py', 'uv.lock']),
        eval: at(['eval.py', 'model.py', 'pyproject.toml', 'read.py', 'uv.lock']),
      });
    }).pipe(Effect.provide(liveOver(recording([])))),
  );
});
