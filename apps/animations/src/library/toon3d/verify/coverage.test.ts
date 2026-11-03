import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect } from 'bun:test';
import { Effect, FileSystem, Option, Schema } from 'effect';
import { it } from 'effect-bun-test';
import type { ViewName } from '../render.ts';
import { keptPaint, uncovered, witnessText, type KeptPaint } from './coverage.ts';
import { decode, VIEWS } from './pipeline.ts';
import {
  ColourCoverageJson,
  ColourProbesJson,
  type ColourProbes,
  type ColourCoverage,
} from './probes.ts';
import { probesFile } from './run.ts';

/** How many flat colours the lead's coverage lets go with no probe, each with its reason. */
const LEAD_EXEMPTIONS = 0;

/** The lead's probes, coverage and each kept view read for coverage. */
const lead = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const probes = yield* Schema.decodeEffect(ColourProbesJson)(
    yield* fs.readFileString(probesFile('lead-feast')),
  );
  const coverage = yield* Schema.decodeEffect(ColourCoverageJson)(
    yield* fs.readFileString(
      `${import.meta.dir}/../../cast/lead-feast/cast-sheet/colour-coverage.json`,
    ),
  );
  const kept = yield* Effect.forEach(VIEWS, (view) =>
    Effect.map(
      Effect.flatMap(
        fs.readFile(`${import.meta.dir}/../../cast/lead-feast/cast-sheet/views/${view}.png`),
        decode,
      ),
      (raster) => [view, keptPaint(raster)] as const,
    ),
  );
  return { probes, coverage, kept: new Map<ViewName, KeptPaint>(kept) };
}).pipe(Effect.provide(BunServices.layer));

/** Every uncovered witness of every view, named `<view> region <x,y> [x, y, w, h] Lab L a b`. */
const gaps = (
  kept: ReadonlyMap<ViewName, KeptPaint>,
  probes: ColourProbes,
  coverage: ColourCoverage,
): ReadonlyArray<string> =>
  VIEWS.flatMap((view) =>
    Option.match(Option.fromUndefinedOr(kept.get(view)), {
      onNone: () => [`${view} not read`],
      onSome: (paint) =>
        uncovered(paint, probes.views[view], coverage.exempt[view]).map(
          (w) => `${view} ${witnessText(paint, w)}`,
        ),
    }),
  );

describe("the lead's colour coverage of the kept views' flat paints", () => {
  it.effect(
    'every flat witness of every kept view has a probe in its region within the colour bar of it, or an exemption with its reason',
    () =>
      Effect.gen(function* () {
        const { probes, coverage, kept } = yield* lead;
        const exemptions = VIEWS.reduce((n, view) => n + coverage.exempt[view].length, 0);
        expect({ uncovered: gaps(kept, probes, coverage), exemptions }).toEqual({
          uncovered: [],
          exemptions: LEAD_EXEMPTIONS,
        });
      }),
  );
});
