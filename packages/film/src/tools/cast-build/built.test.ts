// Coverage's cut and fit read from the build cache: a cut and a passing fit
// the cache holds at the current keys are measured true; a cache without them
// leaves them unmeasured; failing fit rows are measured false.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Option, Path } from 'effect';
import { ContentStore } from '../content-store.ts';
import { memoryFileSystem, memoryLocks, text } from '../host/testing.ts';
import { measuredOf } from './built.ts';
import type { Coverage } from './coverage.ts';
import { coverageFacts } from './coverage-facts.ts';
import { type Stage, buildGraph, fileInput, stageInput } from './graph.ts';

const COVERAGE: Coverage = {
  member: 'm',
  entries: [
    { id: 'turnaround-front', cut: 'puppet', file: 'front.png', for: [] },
    { id: 'poses-poses-1', cut: 'puppet', fitted: 'turnaround-front', file: 'p1.png', for: [] },
  ],
};

/** The member's cut and fit stages, as `memberStages` names them; the fit rows pass unless `failing`. */
const stagesOf = (failing: boolean): ReadonlyArray<Stage<never>> => [
  {
    id: 'cut:turnaround-front@m',
    inputs: [fileInput('/m/front.png')],
    version: '1',
    run: (ctx) => ctx.file('/m/front.png'),
  },
  ...['turnaround-front', 'poses-poses-1'].map((id): Stage<never> => ({
    id: `fit:${id}@m`,
    inputs: [stageInput('cut:turnaround-front@m')],
    version: '1',
    run: () =>
      Effect.succeed(text(`[{"view":"${id}","rows":[{"name":"silhouette","pass":${!failing}}]}]`)),
  })),
  {
    id: 'renders:turnaround-front@m',
    inputs: [stageInput('cut:turnaround-front@m')],
    version: '1',
    run: () => Effect.die('coverage runs no renders'),
  },
];

const files = () =>
  new Map<string, Uint8Array>([
    ['/m/front.png', text('front')],
    ['/m/p1.png', text('pose')],
    ['/m/cutout/sheets/front/record.json', text('{"missed":[]}')],
  ]);

const options = { cache: '/cache', plan: false, touch: [], spend: new Set<never>() };

const services = (disk: Map<string, Uint8Array>) =>
  ContentStore.layer.pipe(Layer.provideMerge([memoryFileSystem(disk), Path.layer, memoryLocks]));

describe('coverage reads the build cache', () => {
  it.effect(
    'a cut and a passing fit in the cache at the current keys are measured, not unmeasured',
    () =>
      Effect.gen(function* () {
        // the build made the cut and the fits (not the renders, which coverage never reads)
        yield* buildGraph(
          stagesOf(false).filter((s) => !s.id.startsWith('renders:')),
          options,
        );
        const measured = yield* measuredOf(stagesOf(false), COVERAGE, 'm', {
          cache: '/cache',
          run: false,
        });
        expect(measured['turnaround-front']).toEqual({
          cut: Option.some(true),
          fit: Option.some(true),
        });
        expect(measured['poses-poses-1']).toEqual({
          cut: Option.some(true),
          fit: Option.some(true),
        });
        const facts = yield* coverageFacts('/m', COVERAGE, measured);
        expect(facts['turnaround-front']).toMatchObject({ cut: true, fit: true, unmeasured: [] });
      }).pipe(Effect.provide(services(files()))),
  );

  it.effect('a cache without them leaves them unmeasured; failing fit rows measure false', () =>
    Effect.gen(function* () {
      const empty = yield* measuredOf(stagesOf(false), COVERAGE, 'm', {
        cache: '/cache',
        run: false,
      });
      expect(empty['turnaround-front']).toEqual({ cut: Option.none(), fit: Option.none() });
      const facts = yield* coverageFacts('/m', COVERAGE, empty);
      expect(facts['turnaround-front']?.unmeasured).toEqual(['cut', 'fit']);
      // measuring runs the free stages with no spend and keeps them, so a plan then reads them
      yield* measuredOf(stagesOf(true), COVERAGE, 'm', { cache: '/cache', run: true });
      const failing = yield* measuredOf(stagesOf(true), COVERAGE, 'm', {
        cache: '/cache',
        run: false,
      });
      expect(failing['turnaround-front']).toEqual({
        cut: Option.some(true),
        fit: Option.some(false),
      });
    }).pipe(Effect.provide(services(files()))),
  );
});
