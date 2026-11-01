// The cast build's stage graph over a fake graph in memory: a rerun with
// nothing changed runs nothing, a stage that makes the same bytes stops the
// rerun there, `--touch` plans one input's change, and a stage that would
// spend, or waits on the owner, holds every stage below it.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Option, Path } from 'effect';
import { memoryFileSystem, memoryLocks, text } from '../host/testing.ts';
import { ContentStore } from '../content-store.ts';
import {
  type BuildOptions,
  type Stage,
  type StageFailed,
  WaitingOwner,
  buildGraph,
  fileInput,
  stageInput,
} from './graph.ts';

const options = (over: Partial<BuildOptions> = {}): BuildOptions => ({
  cache: '/cache',
  plan: false,
  touch: [],
  spend: new Set(),
  ...over,
});

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

describe('the cast build graph', () => {
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
});
