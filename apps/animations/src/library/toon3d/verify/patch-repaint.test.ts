import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect } from 'bun:test';
import { Effect, FileSystem, Option, Schema } from 'effect';
import { it } from 'effect-bun-test';
import { PART } from '../figure.ts';
import type { ViewName } from '../render.ts';
import { BARS } from './bars.ts';
import {
  keptPaint,
  PATCH_FLOOR,
  patchesOf,
  patchRepainter,
  patchText,
  REPAINT_APART,
  repaintColour,
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

/** Whether any pixel of the probe's box is set in `mask`: an untouched probe reads the repaint as it reads the kept, ΔE 0 where the control passes at 0, so the verdict is read over the touched probes alone, and a repaint that touches no probe escapes. */
const touches = (mask: Uint8Array, width: number, probe: ColourProbe): boolean => {
  const [x0, y0, w, h] = probe.box;
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) if (mask[y * width + x] === 1) return true;
  return false;
};

describe('a kept flat patch repainted alone, to a colour past twice the bar from it', () => {
  it.effect(
    'in every kept view, repainting the pixels of any one patch at or above the area floor, and no other, to the nearest patch colour more than twice the bar from each of its witnesses fails colour, where the kept itself passes',
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
            const patches = patchesOf(paint);
            const repaint = patchRepainter(kept);
            const mask = new Uint8Array(kept.width * kept.height);
            const control = colourOf(view, readProbes(view, list, kept, kept, ids));
            const checked = patches
              .map((patch, k) => ({ patch, k }))
              .filter(({ patch }) => patch.pixels.length >= PATCH_FLOOR);
            const escaped = checked.flatMap(({ patch, k }) =>
              Option.match(repaintColour(kept, paint, patches, k, REPAINT_APART), {
                onNone: () => [`${view} ${patchText(paint, patch)} has no colour to repaint`],
                onSome: (colour) => {
                  const scene = repaint(patch, colour);
                  for (const i of patch.pixels) mask[i] = 1;
                  const touched = list.filter((probe) => touches(mask, kept.width, probe));
                  for (const i of patch.pixels) mask[i] = 0;
                  return [`${view} ${patchText(paint, patch)} painted ${colour.join(' ')}`].filter(
                    () =>
                      touched.length === 0 ||
                      colourOf(view, readProbes(view, touched, kept, scene, ids)).pass,
                  );
                },
              }),
            );
            const stray = checked.slice(0, 3).map(({ patch }) => {
              const scene = repaint(patch, [0, 255, 0]);
              const own = new Set(patch.pixels);
              const changed: Array<number> = [];
              for (let i = 0; i < kept.width * kept.height; i++)
                if (
                  kept.rgba.subarray(i * 4, i * 4 + 4).some((v, n) => v !== scene.rgba[i * 4 + n])
                )
                  changed.push(i);
              return changed.length === own.size && changed.every((i) => own.has(i));
            });
            return {
              control: `${view} ${control.pass} ${control.value}`,
              checked: checked.length,
              escaped,
              stray,
            };
          }),
        );
        expect(rows.map((r) => r.control)).toEqual(VIEWS.map((view) => `${view} true 0`));
        expect(rows.flatMap((r) => r.escaped)).toEqual([]);
        expect(Math.min(...rows.map((r) => r.checked))).toBeGreaterThan(100);
        expect(rows.flatMap((r) => r.stray)).toEqual(VIEWS.flatMap(() => [true, true, true]));
      }).pipe(Effect.provide(BunServices.layer)),
  );
});
