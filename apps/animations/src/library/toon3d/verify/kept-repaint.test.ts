import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect } from 'bun:test';
import { Effect, FileSystem, Option, Schema } from 'effect';
import { it } from 'effect-bun-test';
import { PART } from '../figure.ts';
import { BARS } from './bars.ts';
import type { Raster } from './measures.ts';
import { decode, readProbes } from './pipeline.ts';
import { ColourProbesJson, type ColourProbe } from './probes.ts';
import { probesFile } from './run.ts';
import { verdictOf, type CheckVerdict, type ProbeMeasured } from './verdict.ts';

/** The colour check's verdict over the front view's probe readings. */
const colourOf = (probes: ReadonlyArray<ProbeMeasured>): CheckVerdict =>
  Option.getOrThrow(
    Option.fromUndefinedOr(
      verdictOf(
        BARS.filter((b) => b.id === 'colour'),
        {
          renders: { compared: 0, differing: [] },
          views: [
            {
              view: 'front',
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

/** The right side of the front's hair, where the kept paints its flat dark shade. */
const SHADE_SIDE = { x0: 175, y0: 70, x1: 199, y1: 110 };

/** The lighter hair tone the kept paints across the crown. */
const LIGHTER_HAIR = [107, 62, 43];

/** An ids pass that names the hair's shade side hair, and each probe's box its own part. */
const idsFor = (kept: Raster, probes: ReadonlyArray<ColourProbe>): Raster => {
  const rgba = new Uint8Array(kept.rgba.length);
  const name = (x: number, y: number, id: number): void => {
    rgba.set([id * 12, id * 12, id * 12, 255], (y * kept.width + x) * 4);
  };
  for (let y = SHADE_SIDE.y0; y <= SHADE_SIDE.y1; y++)
    for (let x = SHADE_SIDE.x0; x <= SHADE_SIDE.x1; x++) name(x, y, PART.hair);
  for (const probe of probes) {
    const [x0, y0, w, h] = probe.box;
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) name(x, y, PART[probe.part]);
  }
  return { width: kept.width, height: kept.height, rgba };
};

/** The kept front with its dark hair shade, on the hair's shade side, painted the lighter hair tone. */
const shadeRepainted = (kept: Raster): Raster => {
  const rgba = kept.rgba.slice();
  for (let y = SHADE_SIDE.y0; y <= SHADE_SIDE.y1; y++)
    for (let x = SHADE_SIDE.x0; x <= SHADE_SIDE.x1; x++) {
      const i = (y * kept.width + x) * 4;
      const [r = 0, g = 0] = rgba.subarray(i, i + 2);
      if (r > 55 && r < 100 && g > 32 && g < 57) rgba.set([...LIGHTER_HAIR, 255], i);
    }
  return { width: kept.width, height: kept.height, rgba };
};

describe('a kept paint repainted between other paints', () => {
  it.effect(
    "the front's dark hair shade painted the lighter hair tone fails colour at a hair shade probe, where the kept itself passes",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const probes = yield* Schema.decodeEffect(ColourProbesJson)(
          yield* fs.readFileString(probesFile('lead-feast')),
        );
        const kept = yield* decode(
          yield* fs.readFile(`${import.meta.dir}/../../cast/lead-feast/cast-sheet/views/front.png`),
        );
        const front = probes.views.front;
        const ids = idsFor(kept, front);
        expect(colourOf(readProbes('front', front, kept, kept, ids))).toMatchObject({
          pass: true,
          value: '0',
        });
        const repainted = colourOf(readProbes('front', front, kept, shadeRepainted(kept), ids));
        expect(repainted.pass).toBe(false);
        expect(repainted.at).toStartWith('front hair shade #');
        expect(Number(repainted.value)).toBeGreaterThan(3);
      }).pipe(Effect.provide(BunServices.layer)),
  );
});
