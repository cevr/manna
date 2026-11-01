// The train and eval stages over a fake training set, with the reader's live
// layer replaced: no Modal call without `--spend modal`; one train, then
// each drawing's eval, when it is allowed; a rerun asks the reader nothing;
// a change to one of the reader's source files is a new train.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Path } from 'effect';
import { memoryFileSystem, memoryLocks, text } from '../host/testing.ts';
import { ContentStore } from '../content-store.ts';
import { type BuildOptions, type Stage, buildGraph, fileInput } from './graph.ts';
import { CastReader } from './reader.ts';
import { evalStage, trainStage, trainsetStage } from './stages.ts';

const options = (over: Partial<BuildOptions> = {}): BuildOptions => ({
  cache: '/cache',
  plan: false,
  touch: [],
  spend: new Set(),
  ...over,
});

const SOURCES = ['/reader/model.py', '/reader/uv.lock'];
const RENDERS = { 'm/front': 'renders:front@m', 'm/side': 'renders:side@m' };

/** Two shards (each a file's bytes), the training set, its train and each drawing's eval. */
const graph = (): ReadonlyArray<Stage<CastReader>> => [
  ...Object.values(RENDERS).map((id) => ({
    id,
    inputs: [fileInput(`/in/${id}.tar`)],
    version: '1',
    run: (ctx: Parameters<Stage<never>['run']>[0]) => ctx.file(`/in/${id}.tar`),
  })),
  trainsetStage(RENDERS),
  trainStage(RENDERS, SOURCES),
  ...Object.values(RENDERS).map(evalStage),
];

const files = () =>
  new Map<string, Uint8Array>([
    ['/in/renders:front@m.tar', text('front shard')],
    ['/in/renders:side@m.tar', text('side shard')],
    ['/reader/model.py', text('model')],
    ['/reader/uv.lock', text('lock')],
  ]);

const build = (
  disk: Map<string, Uint8Array>,
  asked: Array<string>,
  over: Partial<BuildOptions> = {},
) =>
  buildGraph(graph(), options(over)).pipe(
    Effect.provide(
      Layer.mergeAll(
        ContentStore.layer.pipe(
          Layer.provideMerge([memoryFileSystem(disk), Path.layer, memoryLocks]),
        ),
        CastReader.layerTest({ evaluate: '{"seen":{"accuracy":1}}' }, asked, SOURCES),
      ),
    ),
  );

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
});
