// The lock stage over a fake trained graph, with the reader's test layer:
// the lock's fields come from its inputs' outputs and the train's note; a
// changed eval output changes the lock; a rerun with nothing changed writes
// nothing, and a lock edited by hand is written again.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, type FileSystem, Layer, Option, Path, Schema } from 'effect';
import { sha256Hex } from '../digest.ts';
import { memoryFileSystem, memoryLocks, text } from '../host/testing.ts';
import { ContentStore } from '../content-store.ts';
import { type Stage, buildGraph, fileInput, stageInput } from './graph.ts';
import { lockStage } from './lock.ts';
import { CastReader } from './reader.ts';
import { evalStage, trainStage } from './stages.ts';

const LOCK = '/library/reader.lock.json';
const SOURCES = ['/reader/model.py'];
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
  trainStage(CANDIDATES, SOURCES),
  ...CANDIDATES.map((c) => evalStage(c.renders, [])),
  {
    id: 'eval:clip:clip-b@m',
    inputs: [stageInput('train'), fileInput('/in/chain.json')],
    version: '1',
    run: (ctx) => ctx.file('/in/chain.json'),
  },
];
const lock = lockStage({
  file: LOCK,
  candidates: CANDIDATES,
  sources: SOURCES,
  clip: Option.some({ member: 'm', clip: 'clip-b' }),
});

const chain = (iou: number) =>
  text(
    `{"runs":[{"from":0,"to":124,"drawing":"m/front"}],"keys":[0],"iou":{"41-123":${iou}},"named":{"41-123":{"m/front":83}},"ms":5}`,
  );

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
    ['/in/chain.json', chain(0.9132)],
    ['/reader/model.py', text('model')],
  ]);

/** `evaluate` is eval.py's JSON text, the same for every drawing. */
const build = (disk: Disk, stdout = STDOUT, evaluate = jsonOf(EVAL)) =>
  buildGraph<CastReader | FileSystem.FileSystem>([...graph, lock], {
    cache: '/cache',
    plan: false,
    touch: [],
    spend: new Set(['modal'] as const),
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
          { evaluate, checkpoint: text('ckpt'), trainStdout: stdout },
          [],
          SOURCES,
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
      expect(String(l['reader'])).toMatch(/^[0-9a-f]{64}$/);
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
      expect(l['clip']).toEqual({
        member: 'm',
        clip: 'clip-b',
        iou: { '41-123': 0.9132 },
        named: { '41-123': { 'm/front': 83 } },
        runs: [{ from: 0, to: 124, drawing: 'm/front' }],
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

  it.effect("eval.py's null for a side with no samples reads as absent", () =>
    Effect.gen(function* () {
      const disk = files();
      const report = yield* build(disk, STDOUT, `{"seen":${jsonOf(EVAL.seen)},"unseen":null}`);
      expect(stateOf(report)['lock']).toBe('ran');
      expect(lockOf(disk)['untrained']).toEqual({});
      expect(lockOf(disk)['held']).toMatchObject({ drawings: 1, accuracy: 1 });
    }),
  );

  it.effect('a changed eval output changes the lock', () =>
    Effect.gen(function* () {
      const disk = files();
      yield* build(disk);
      const before = read(disk, LOCK);
      disk.set('/in/chain.json', chain(0.95));
      const report = yield* build(disk);
      expect(stateOf(report)['eval:clip:clip-b@m']).toBe('ran');
      expect(stateOf(report)['lock']).toBe('ran');
      expect(read(disk, LOCK)).not.toBe(before);
      expect(lockOf(disk)['clip']).toMatchObject({ iou: { '41-123': 0.95 } });
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
