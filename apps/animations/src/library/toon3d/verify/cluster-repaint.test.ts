import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect } from 'bun:test';
import { Effect, FileSystem, Option, Schema } from 'effect';
import { it } from 'effect-bun-test';
import { PART } from '../figure.ts';
import type { ViewName } from '../render.ts';
import { BARS } from './bars.ts';
import {
  clustersOf,
  keptPaint,
  REPAINT_APART,
  repainter,
  repaintPairs,
  witnessText,
} from './coverage.ts';
import type { Raster } from './measures.ts';
import { decode, readProbes, VIEWS } from './pipeline.ts';
import { ColourProbesJson, type ColourProbe } from './probes.ts';
import { probesFile } from './run.ts';
import { verdictOf, type CheckVerdict, type ProbeMeasured } from './verdict.ts';

/** The colour check's verdict over one view's probe readings. */
const colourOf = (view: ViewName, probes: ReadonlyArray<ProbeMeasured>): CheckVerdict =>
  Option.getOrThrow(
    Option.fromUndefinedOr(
      verdictOf(
        BARS.filter((b) => b.id === 'colour'),
        {
          renders: { compared: 0, differing: [] },
          views: [
            {
              view,
              iou: 1,
              probes,
              flatness: [],
              keptHairBlobs: 0,
              inkWidth: 8,
              keptInkWidth: 8,
              inkDeltaE: Option.some(0),
            },
          ],
          frontRows: Option.none(),
          face: Option.none(),
          bend: [],
          turn: [],
        },
      ).checks[0],
    ),
  );

/** An ids pass that names each probe's box its own part, so every probe reads wherever the render lays its paint. */
const idsFor = (kept: Raster, probes: ReadonlyArray<ColourProbe>): Raster => {
  const rgba = new Uint8Array(kept.rgba.length);
  for (const probe of probes) {
    const [x0, y0, w, h] = probe.box;
    const id = PART[probe.part] * 12;
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) rgba.set([id, id, id, 255], (y * kept.width + x) * 4);
  }
  return { width: kept.width, height: kept.height, rgba };
};

/** Whether a repaint changed any pixel of the probe's box: an untouched probe reads the repaint as it reads the kept, ΔE 0 where the control passes at 0, so the verdict is read over the touched probes alone. */
const touches = (kept: Raster, scene: Raster, probe: ColourProbe): boolean => {
  const [x0, y0, w, h] = probe.box;
  for (let y = y0; y < y0 + h; y++) {
    const at = (y * kept.width + x0) * 4;
    for (let k = at; k < at + w * 4; k++) if (kept.rgba[k] !== scene.rgba[k]) return true;
  }
  return false;
};

describe('a kept flat paint repainted another paint of its region', () => {
  it.effect(
    "in every kept view, repainting any witness cluster's colour to the nearest of its region's other clusters' past twice the bar fails colour, where the kept itself passes",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const probes = yield* Schema.decodeEffect(ColourProbesJson)(
          yield* fs.readFileString(probesFile('lead-feast')),
        );
        const rows = yield* Effect.forEach(VIEWS, (view) =>
          Effect.gen(function* () {
            const kept = yield* decode(
              yield* fs.readFile(
                `${import.meta.dir}/../../cast/lead-feast/cast-sheet/views/${view}.png`,
              ),
            );
            const list = probes.views[view];
            const ids = idsFor(kept, list);
            const paint = keptPaint(kept);
            const pairs = repaintPairs(clustersOf(paint), REPAINT_APART);
            const repaint = repainter(kept, paint);
            const control = colourOf(view, readProbes(view, list, kept, kept, ids));
            const escaped = pairs.flatMap(({ from, to }) => {
              const scene = repaint(from, to);
              const touched = list.filter((probe) => touches(kept, scene, probe));
              return [
                `${view} ${witnessText(paint, from.seed)} painted Lab ${to.seed.lab.map((v) => v.toFixed(1)).join(' ')}`,
              ].filter(() => colourOf(view, readProbes(view, touched, kept, scene, ids)).pass);
            });
            const stray = pairs.slice(0, 1).flatMap((first) =>
              pairs
                .filter((next) => next.from.region !== first.from.region)
                .slice(0, 1)
                .map((next) => {
                  repaint(first.from, first.to);
                  const scene = repaint(next.from, next.to);
                  return paint.region.filter(
                    (r, i) =>
                      r !== next.from.region &&
                      kept.rgba
                        .subarray(i * 4, i * 4 + 4)
                        .some((v, k) => v !== scene.rgba[i * 4 + k]),
                  ).length;
                }),
            );
            return {
              control: `${view} ${control.pass} ${control.value}`,
              pairs: pairs.length,
              escaped,
              stray,
            };
          }),
        );
        expect(rows.map((r) => r.control)).toEqual(VIEWS.map((view) => `${view} true 0`));
        expect(rows.flatMap((r) => r.escaped)).toEqual([]);
        expect(Math.min(...rows.map((r) => r.pairs))).toBeGreaterThan(50);
        const stray = rows.flatMap((r) => r.stray);
        expect({ checked: stray.length >= 3, stray: stray.filter((n) => n > 0) }).toEqual({
          checked: true,
          stray: [],
        });
      }).pipe(Effect.provide(BunServices.layer)),
  );
});
