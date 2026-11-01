// The train and eval stages over a fake training set, with the reader's live
// layer replaced: no Modal call without `--spend modal`; one train, then
// each drawing's eval, when it is allowed; a rerun asks the reader nothing;
// a change to one of the reader's source files is a new train.

import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Layer, Path } from 'effect';
import { memoryFileSystem, memoryLocks, text } from '../host/testing.ts';
import { ContentStore } from '../content-store.ts';
import type { EntryFacts } from './coverage.ts';
import { type BuildOptions, type Stage, buildGraph, fileInput, stageInput } from './graph.ts';
import { CastReader } from './reader.ts';
import { type Candidate, TRAIN, evalStage, trainStage, trainsetStage } from './stages.ts';

const options = (over: Partial<BuildOptions> = {}): BuildOptions => ({
  cache: '/cache',
  plan: false,
  touch: [],
  spend: new Set(),
  ...over,
});

const SOURCES = ['/reader/model.py', '/reader/uv.lock'];
const complete: EntryFacts = { drawn: true, kept: true, cut: true, bars: true, fit: true };
const candidate = (view: string, facts: Partial<EntryFacts> = {}): Candidate => ({
  drawing: `m/${view}`,
  renders: `renders:${view}@m`,
  fit: `fit:${view}@m`,
  facts: { ...complete, ...facts },
});
const CANDIDATES = [candidate('front'), candidate('side')];

type Ctx = Parameters<Stage<never>['run']>[0];
const fitRows = (pass: boolean) =>
  text(`[{"view":"v","rows":[{"name":"silhouette","pass":${pass}}]}]`);

/**
 * Each candidate's shard (a file's bytes) and fit rows (passing unless
 * `failing` names it), the training set, its train and each drawing's eval.
 * The side's shard reads `cut:side@m` when `sideCut` is on, a stage that
 * spends okra: the side is cut in the build.
 */
const graph = (
  candidates: ReadonlyArray<Candidate> = CANDIDATES,
  o: { readonly failing?: string; readonly sideCut?: boolean } = {},
): ReadonlyArray<Stage<CastReader>> => [
  ...[
    {
      id: 'cut:side@m',
      inputs: [fileInput('/in/side.png')],
      version: '1',
      run: (ctx: Ctx) => ctx.spend('okra', ctx.file('/in/side.png')),
    },
  ].filter(() => o.sideCut === true),
  ...candidates.flatMap((c) => [
    {
      id: c.renders,
      inputs: [
        fileInput(`/in/${c.renders}.tar`),
        ...[stageInput('cut:side@m')].filter(() => o.sideCut === true && c.drawing === 'm/side'),
      ],
      version: '1',
      run: (ctx: Ctx) => ctx.file(`/in/${c.renders}.tar`),
    },
    {
      id: c.fit,
      inputs: [],
      version: '1',
      run: () => Effect.succeed(fitRows(o.failing !== c.drawing)),
    },
  ]),
  trainsetStage(candidates),
  trainStage(candidates, SOURCES),
  ...candidates.map((c) => evalStage(c.renders)),
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
  stages: ReadonlyArray<Stage<CastReader>> = graph(),
) =>
  buildGraph(stages, options(over)).pipe(
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

  it.effect('an entry with an open bar or a failing fit row is not trained on', () =>
    Effect.gen(function* () {
      const spend = { spend: new Set(['modal'] as const) };
      const bars: Array<string> = [];
      yield* build(
        files(),
        bars,
        spend,
        graph([candidate('front'), candidate('side', { bars: false })]),
      );
      expect(bars.filter((a) => a.startsWith('train'))).toEqual([
        expect.stringMatching(/ shards=1$/),
      ]);
      const fit: Array<string> = [];
      yield* build(files(), fit, spend, graph(CANDIDATES, { failing: 'm/side' }));
      expect(fit.filter((a) => a.startsWith('train'))).toEqual([
        expect.stringMatching(/ shards=1$/),
      ]);
    }),
  );

  it.effect('a drawing cut in this build joins its one train', () =>
    Effect.gen(function* () {
      const disk = files();
      disk.set('/in/side.png', text('side drawing'));
      const asked: Array<string> = [];
      const report = yield* build(
        disk,
        asked,
        { spend: new Set(['okra', 'modal'] as const) },
        graph(CANDIDATES, { sideCut: true }),
      );
      expect(stateOf(report)['cut:side@m']).toBe('ran');
      expect(asked.filter((a) => a.startsWith('train'))).toEqual([
        expect.stringMatching(/ shards=2$/),
      ]);
      // without the okra spend the side waits, and the set trains on the front alone
      const waits: Array<string> = [];
      const held = yield* build(
        files(),
        waits,
        { spend: new Set(['modal'] as const) },
        graph(CANDIDATES, { sideCut: true }),
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
