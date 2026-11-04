import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect } from 'bun:test';
import { Array as Arr, Effect, FileSystem, Option, Result, Schema } from 'effect';
import { it } from 'effect-bun-test';
import { PART } from '../figure.ts';
import type { ViewName } from '../render.ts';
import { BARS } from './bars.ts';
import { deltaLab, figureMask, flatMedian, lab, pixel, type Raster, type Rgb } from './measures.ts';
import { decode, readProbes } from './pipeline.ts';
import { ColourProbesJson, probeBox, type ColourProbe } from './probes.ts';
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

/** An ids pass that names each probe's box its own part. */
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

/**
 * Round 6's verifier repaints of a hand's shade: in the hand's rectangle
 * (`x0`, `y0` inclusive to `x1`, `y1` exclusive), each figure pixel of skin
 * (L* 65 to 85, a* over 15, b* over 25) more than ΔE 3 from the hand's first
 * base probe's median takes that probe's central pixel, which erases the
 * shade the hand's dark rim shows; the brighter repaint lays instead the base
 * probes' pixel farthest from the shade, past twice the bar from it.
 */
const HANDS = [
  {
    view: 'front',
    part: 'handL',
    base: 'handL.base.0',
    rect: { x0: 210, y0: 410, x1: 241, y1: 448 },
    changed: 211,
    brighter: [247, 167, 116],
  },
  {
    view: 'profileRight',
    part: 'handR',
    base: 'handR.base.0',
    rect: { x0: 64, y0: 416, x1: 101, y1: 449 },
    changed: 248,
    brighter: [249, 170, 115],
  },
] as const;

/** The kept view with the hand's shade pixels laid `colour`, and how many it laid. */
const shadeRepainted = (
  kept: Raster,
  rect: (typeof HANDS)[number]['rect'],
  base: Rgb,
  colour: Rgb,
) => {
  const figure = figureMask(kept);
  const rgba = kept.rgba.slice();
  let changed = 0;
  for (let y = rect.y0; y < rect.y1; y++)
    for (let x = rect.x0; x < rect.x1; x++) {
      const i = y * kept.width + x;
      const [l, a, b] = lab(pixel(kept, i));
      if (
        figure[i] === 1 &&
        l > 65 &&
        l < 85 &&
        a > 15 &&
        b > 25 &&
        deltaLab([l, a, b], base) > 3
      ) {
        rgba.set([...colour, 255], i * 4);
        changed++;
      }
    }
  return { scene: { width: kept.width, height: kept.height, rgba }, changed };
};

describe("round 6's hand shades erased", () => {
  it.effect(
    "the front left hand's and profileRight right hand's dark rims repainted the hand's base, or a brighter base past twice the bar, fail colour at a probe of the hand, and some probe of the hand reads the repaint past the bar, where the kept itself passes",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const probes = yield* Schema.decodeEffect(ColourProbesJson)(
          yield* fs.readFileString(probesFile('lead-feast')),
        );
        const rows = yield* Effect.forEach(HANDS, ({ view, part, base, rect, brighter }) =>
          Effect.gen(function* () {
            const kept = yield* decode(
              yield* fs.readFile(
                `${import.meta.dir}/../../cast/lead-feast/cast-sheet/views/${view}.png`,
              ),
            );
            const list = probes.views[view];
            const ids = idsFor(kept, list);
            const probe = Option.getOrThrow(
              Option.fromUndefinedOr(list.find((p) => p.id === base)),
            );
            const box = probeBox(probe);
            const median = Option.getOrThrow(flatMedian(kept, box));
            const central = pixel(
              kept,
              (box.y0 + ((box.y1 - box.y0 + 1) >> 1)) * kept.width +
                box.x0 +
                ((box.x1 - box.x0 + 1) >> 1),
            );
            const hand = list.filter((p) => p.part === part);
            const read = (scene: Raster): string => {
              const v = colourOf(view, readProbes(view, list, kept, scene, ids));
              const seen = readProbes(view, hand, kept, scene, ids).flatMap((r) =>
                Option.toArray(Result.getSuccess(r.read)),
              );
              return `${v.pass} ${v.at.startsWith(`${view} ${part} `)} ${Math.max(...seen) > 3}`;
            };
            const erased = shadeRepainted(kept, rect, median, central);
            const bright = shadeRepainted(kept, rect, median, brighter);
            return {
              view,
              control: colourOf(view, readProbes(view, list, kept, kept, ids)).value,
              changed: erased.changed,
              erased: read(erased.scene),
              brighter: read(bright.scene),
            };
          }),
        );
        expect(rows).toEqual(
          Arr.map(HANDS, ({ view, changed }) => ({
            view,
            control: '0',
            changed,
            erased: 'false true true',
            brighter: 'false true true',
          })),
        );
      }).pipe(Effect.provide(BunServices.layer)),
  );
});
