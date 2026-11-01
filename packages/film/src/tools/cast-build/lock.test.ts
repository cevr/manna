// The lock stage over a fake trained graph, with the reader's test layer:
// the lock's fields come from its inputs' outputs and the train's note; a
// changed eval output changes the lock; a trained drawing with no held eval
// fails it; every clip's entry is the lock's, a clip that fails its bars or
// has no eval is written and counted unpassed; a rerun with nothing changed
// writes nothing, and a lock edited by hand is written again.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, type FileSystem, Layer, Option, Path, Schema } from 'effect';
import { sha256Hex } from '../digest.ts';
import { memoryFileSystem, memoryLocks, text } from '../host/testing.ts';
import { ContentStore } from '../content-store.ts';
import { type Stage, StageFailed, buildGraph, fileInput, stageInput } from './graph.ts';
import { ClipsFailed, checkClips, failedClipsOf, lockStage } from './lock.ts';
import { CastReader } from './reader.ts';
import { TRAIN, evalStage, trainStage } from './stages.ts';

const LOCK = '/library/reader.lock.json';
/** The reader's train files, out of basename order: the key sorts them by basename. */
const TRAIN_FILES = ['/reader/train.py', '/reader/model.py'];
/** `front` is trained on; `side` is a candidate the set leaves out. */
const CANDIDATES = ['front', 'side'].map((v) => ({
  drawing: `m/${v}`,
  renders: `renders:${v}@m`,
  status: `status:${v}@m`,
}));
const EVAL = {
  seen: {
    n: 40,
    accuracy: 1,
    angle_deg: { n: 360, median: 0.7, p90: 3.1, mean: 1 },
    joint_px: { median: 1.04, p90: 1.7 },
  },
  unseen: { n: 40, angle_deg: { median: 12.3, p90: 63 }, joint_px: { median: 17, p90: 62.7 } },
};
/** `modal run`'s stdout: the fit's JSON, then the app's URL last. */
const STDOUT = [
  '✓ Initialized.',
  '{"steps": 4800, "first_loss": 0.9, "last_loss": 0.00862, "sec_per_step": 0.5236, "classes": 40}',
  'View run at https://modal.com/apps/me/main/ap-CrXrNlBRXGxPBIG0oJ8vMW',
].join('\n');

const decoder = new TextDecoder();
const read = (disk: Map<string, Uint8Array>, file: string) => decoder.decode(disk.get(file));

/** Each view's renders (a shard file's bytes), the set (front only), the train, each eval, the clip's chain (read off disk) and the lock. */
const graph: ReadonlyArray<Stage<CastReader | FileSystem.FileSystem>> = [
  ...CANDIDATES.map((c): Stage<never> => ({
    id: c.renders,
    inputs: [fileInput(`/in/${c.renders}.tar`)],
    version: '1',
    run: (ctx) => ctx.file(`/in/${c.renders}.tar`),
  })),
  {
    id: 'trainset',
    inputs: [stageInput('renders:front@m')],
    version: '1',
    run: (ctx) =>
      Effect.map(ctx.output('renders:front@m'), (shard) => text(`m/front=${sha256Hex(shard)}\n`)),
  },
  trainStage(CANDIDATES, TRAIN_FILES, LOCK),
  ...CANDIDATES.map((c) => evalStage(c.renders, [])),
  ...['clip-b', 'wave'].map((clip): Stage<never> => ({
    id: `eval:clip:${clip}@m`,
    inputs: [stageInput('train'), fileInput(`/in/${clip}.json`)],
    version: '1',
    run: (ctx) => ctx.file(`/in/${clip}.json`),
  })),
];
const CLIPS = [
  { member: 'm', clip: 'clip-b' },
  { member: 'm', clip: 'wave' },
];
const lock = lockStage({
  file: LOCK,
  candidates: CANDIDATES,
  trainFiles: TRAIN_FILES,
  clips: CLIPS,
});

/** An eval:clip stage's output: the clip's lock entry, its end band at `iou`, failing for each of `fails`. */
const entryOf = (clip: string, iou: number, fails: ReadonlyArray<string> = []) => ({
  member: 'm',
  clip,
  sha256: `sha-${clip}`,
  frames: 124,
  bands: [{ from: 41, to: 123, expect: ['m/front'] }],
  iou: { '0-123': 0.91, '41-123': iou },
  named: { '0-123': { 'm/front': 124 }, '41-123': { 'm/front': 83 } },
  holds: { start: 12, end: 83 },
  scale: { heightRatio: { min: 0.991, max: 1.0015 }, feetPx: { min: 0, max: 1 } },
  runs: [{ from: 0, to: 124, drawing: 'm/front' }],
  pass: fails.length === 0,
  fails,
});
const chain = (iou: number, clip = 'clip-b', fails: ReadonlyArray<string> = []) =>
  text(jsonOf(entryOf(clip, iou, fails)));

/** A disk that records every path written to it. */
class Disk extends Map<string, Uint8Array> {
  readonly written: Array<string> = [];
  override set(key: string, value: Uint8Array) {
    this.written?.push(key);
    return super.set(key, value);
  }
}

const files = () =>
  new Disk([
    ['/in/renders:front@m.tar', text('front shard')],
    ['/in/renders:side@m.tar', text('side shard')],
    ['/in/clip-b.json', chain(0.9132)],
    ['/in/wave.json', chain(0.95, 'wave')],
    ['/reader/model.py', text('model')],
    ['/reader/train.py', text('train')],
  ]);

/** `graph` with the trained drawing's eval failing. */
const frontEvalFails = graph.map((stage): Stage<CastReader | FileSystem.FileSystem> => {
  if (stage.id !== 'eval:front@m') return stage;
  return {
    ...stage,
    run: () => Effect.fail(StageFailed.make({ reason: 'eval: the reader died' })),
  };
});

/** `evaluate` is eval.py's JSON text, the same for every drawing. */
const build = (
  disk: Disk,
  stdout = STDOUT,
  evaluate = jsonOf(EVAL),
  stages = graph,
  spend: ReadonlySet<'modal'> = new Set(['modal'] as const),
) =>
  buildGraph<CastReader | FileSystem.FileSystem>([...stages, lock], {
    root: '/',
    cache: '/cache',
    plan: false,
    touch: [],
    spend,
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        ContentStore.layer.pipe(
          Layer.provideMerge([
            memoryFileSystem(disk, new Set(['/library'])),
            Path.layer,
            memoryLocks,
          ]),
        ),
        CastReader.layerTest(
          { evaluate: () => evaluate, checkpoint: text('ckpt'), trainStdout: stdout },
          [],
          { train: TRAIN_FILES, read: [], eval: [] },
        ),
      ),
    ),
  );
const jsonOf = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

const LockJson = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown));
const lockOf = (disk: Disk) => Schema.decodeSync(LockJson)(read(disk, LOCK));
const stateOf = (report: { stages: ReadonlyArray<{ id: string; state: string }> }) =>
  Object.fromEntries(report.stages.map((s) => [s.id, s.state]));

describe('cast build: the reader lock', () => {
  it.effect("the lock's fields come from the stages' outputs and the train's note", () =>
    Effect.gen(function* () {
      const disk = files();
      const report = yield* build(disk);
      expect(stateOf(report)['lock']).toBe('ran');
      const set = `m/front=${sha256Hex(text('front shard'))}\n`;
      const l = lockOf(disk);
      const train = report.stages.find((s) => s.id === 'train');
      expect(l['stageKey']).toBe(Option.getOrUndefined(train?.key ?? Option.none()));
      // the reader key: the set, the config and each train file by basename, sorted
      const trainer = {
        'model.py': sha256Hex(text('model')),
        'train.py': sha256Hex(text('train')),
      };
      expect(l['trainer']).toEqual(trainer);
      expect(l['reader']).toBe(
        sha256Hex(
          text(
            [
              `trainset=${sha256Hex(text(set))}`,
              `config=${jsonOf(TRAIN)}`,
              `model.py=${trainer['model.py']}`,
              `train.py=${trainer['train.py']}`,
            ].join('\n'),
          ),
        ),
      );
      expect(l['trainset']).toBe(sha256Hex(text(set)));
      expect(l['drawings']).toEqual({ 'm/front': sha256Hex(text('front shard')) });
      expect(l['checkpointSha256']).toBe(sha256Hex(text('ckpt')));
      expect(l['config']).toMatchObject({ steps: 4800, backbone: 'facebook/dinov2-small' });
      expect(l['train']).toMatchObject({
        trainedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        modalApp: 'ap-CrXrNlBRXGxPBIG0oJ8vMW',
        steps: 4800,
        secPerStep: 0.5236,
        trainSec: 2513,
        finalLoss: 0.00862,
      });
      expect(l['held']).toEqual({
        drawings: 1,
        accuracy: 1,
        byDrawing: {
          'm/front': {
            n: 40,
            accuracy: 1,
            angleDeg: { median: 0.7, p90: 3.1 },
            jointPx: { median: 1.04, p90: 1.7 },
          },
        },
      });
      expect(l['untrained']).toEqual({
        'm/side': {
          n: 40,
          angleDeg: { median: 12.3, p90: 63 },
          jointPx: { median: 17, p90: 62.7 },
        },
      });
      expect(l['clip']).toBeUndefined();
      expect(l['clips']).toEqual({
        passed: 2,
        of: 2,
        byClip: { 'm/clip-b': entryOf('clip-b', 0.9132), 'm/wave': entryOf('wave', 0.95) },
      });
      expect(l['spend']).toEqual({ buildCountedUsd: 0.92 });
    }),
  );

  it.effect('a train whose stdout holds no fit JSON is kept, and the lock leaves its fit out', () =>
    Effect.gen(function* () {
      const disk = files();
      const report = yield* build(disk, 'View run at https://modal.com/apps/me/main/ap-X');
      expect(stateOf(report)['train']).toBe('ran');
      expect(Object.keys(lockOf(disk)['train'] as object)).toEqual(['stageSec']);
    }),
  );

  it.effect(
    "an adopted train keeps the committed lock's train lines and spend; reader and checkpoint stay",
    () =>
      Effect.gen(function* () {
        const disk = files();
        yield* build(disk);
        const first = lockOf(disk);
        // the committed lock as an earlier train left it; every stage key new (`build.json` dropped, objects kept)
        disk.set(
          LOCK,
          text(jsonOf({ ...first, train: { stageSec: 4361 }, spend: { buildCountedUsd: 3.5 } })),
        );
        disk.delete('/cache/build.json');
        const report = yield* build(disk, STDOUT, jsonOf(EVAL), graph, new Set());
        expect(stateOf(report)['train']).toBe('ran');
        expect(stateOf(report)['lock']).toBe('ran');
        expect(report.modalCalls).toBe(0);
        const l = lockOf(disk);
        expect(l['train']).toEqual({ stageSec: 4361 });
        expect(l['spend']).toEqual({ buildCountedUsd: 3.5 });
        expect(l['reader']).toBe(first['reader']);
        expect(l['trainset']).toBe(first['trainset']);
        expect(l['checkpointSha256']).toBe(first['checkpointSha256']);
      }),
  );

  it.effect("eval.py's null for a side with no samples reads as absent", () =>
    Effect.gen(function* () {
      const disk = files();
      const report = yield* build(disk, STDOUT, `{"seen":${jsonOf(EVAL.seen)},"unseen":null}`);
      expect(stateOf(report)['lock']).toBe('ran');
      expect(lockOf(disk)['untrained']).toEqual({});
      expect(lockOf(disk)['held']).toMatchObject({ drawings: 1, accuracy: 1 });
    }),
  );

  it.effect(
    'a trained drawing whose eval has no held samples fails the lock, which writes nothing',
    () =>
      Effect.gen(function* () {
        const disk = files();
        const report = yield* build(disk, STDOUT, '{"seen":null,"unseen":null}');
        expect(stateOf(report)['eval:front@m']).toBe('ran');
        expect(stateOf(report)['lock']).toBe('failed');
        expect(report.stages.find((s) => s.id === 'lock')?.reason).toEqual(
          Option.some('lock: eval:front@m has no held samples'),
        );
        expect(disk.has(LOCK)).toBe(false);
      }),
  );

  it.effect('a trained drawing whose eval failed fails the lock, which writes nothing', () =>
    Effect.gen(function* () {
      const disk = files();
      const report = yield* build(disk, STDOUT, jsonOf(EVAL), frontEvalFails);
      expect(stateOf(report)['eval:front@m']).toBe('failed');
      expect(stateOf(report)['eval:side@m']).toBe('ran');
      expect(stateOf(report)['lock']).toBe('failed');
      expect(report.stages.find((s) => s.id === 'lock')?.reason).toEqual(
        Option.some('lock: no held eval for m/front'),
      );
      expect(disk.has(LOCK)).toBe(false);
    }),
  );

  it.effect('a changed eval output changes the lock', () =>
    Effect.gen(function* () {
      const disk = files();
      yield* build(disk);
      const before = read(disk, LOCK);
      disk.set('/in/clip-b.json', chain(0.95));
      const report = yield* build(disk);
      expect(stateOf(report)['eval:clip:clip-b@m']).toBe('ran');
      expect(stateOf(report)['lock']).toBe('ran');
      expect(read(disk, LOCK)).not.toBe(before);
      expect(lockOf(disk)['clips']).toMatchObject({
        byClip: { 'm/clip-b': { iou: { '41-123': 0.95 } } },
      });
    }),
  );

  it.effect('a clip that fails its bars is written all the same, and not counted passed', () =>
    Effect.gen(function* () {
      const disk = files();
      disk.set('/in/wave.json', chain(0.8, 'wave', ['iou 41-123: 0.8 under 0.88']));
      const report = yield* build(disk);
      expect(stateOf(report)['lock']).toBe('ran');
      expect(lockOf(disk)['clips']).toMatchObject({
        passed: 1,
        of: 2,
        byClip: { 'm/wave': { pass: false, fails: ['iou 41-123: 0.8 under 0.88'] } },
      });
      expect(yield* failedClipsOf(read(disk, LOCK), CLIPS)).toEqual([
        'm/wave: iou 41-123: 0.8 under 0.88',
      ]);
    }),
  );

  it.effect('a clip whose eval failed is written as failed with no entry, and counted', () =>
    Effect.gen(function* () {
      const disk = files();
      const stages = graph.map((stage): Stage<CastReader | FileSystem.FileSystem> => {
        if (stage.id !== 'eval:clip:wave@m') return stage;
        return {
          ...stage,
          run: () => Effect.fail(StageFailed.make({ reason: 'the reader died' })),
        };
      });
      const report = yield* build(disk, STDOUT, jsonOf(EVAL), stages);
      expect(stateOf(report)['eval:clip:wave@m']).toBe('failed');
      expect(stateOf(report)['lock']).toBe('ran');
      const clips = lockOf(disk)['clips'] as { passed: number; of: number; byClip: object };
      expect([clips.passed, clips.of, Object.keys(clips.byClip)]).toEqual([1, 2, ['m/clip-b']]);
      expect(yield* failedClipsOf(read(disk, LOCK), CLIPS)).toEqual(['m/wave: no eval']);
    }),
  );

  it.effect(
    'after the build, a lock with a failed or missing clip fails with ClipsFailed naming each; one that passes every clip passes',
    () =>
      Effect.gen(function* () {
        const disk = files();
        disk.set('/in/wave.json', chain(0.8, 'wave', ['iou 41-123: 0.8 under 0.88']));
        yield* build(disk);
        const check = (clips: ReadonlyArray<{ member: string; clip: string }>) =>
          checkClips(LOCK, clips).pipe(Effect.provide(memoryFileSystem(disk)));
        const failed = yield* Effect.flip(check([...CLIPS, { member: 'm', clip: 'gone' }]));
        expect(failed).toBeInstanceOf(ClipsFailed);
        expect(failed).toMatchObject({
          clips: ['m/wave: iou 41-123: 0.8 under 0.88', 'm/gone: no eval'],
        });
        yield* check([{ member: 'm', clip: 'clip-b' }]);
      }),
  );

  it.effect(
    "nothing changed leaves the file's bytes alone; one edited by hand is written again",
    () =>
      Effect.gen(function* () {
        const disk = files();
        yield* build(disk);
        const first = read(disk, LOCK);
        disk.written.length = 0;
        const again = yield* build(disk);
        expect(stateOf(again)['lock']).toBe('cached');
        expect(disk.written.filter((p) => p === LOCK)).toEqual([]);
        expect(read(disk, LOCK)).toBe(first);
        disk.set(LOCK, text('{}'));
        const healed = yield* build(disk);
        expect(stateOf(healed)['lock']).toBe('ran');
        expect(read(disk, LOCK)).toBe(first);
      }),
  );
});
