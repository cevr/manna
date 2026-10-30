// The lead's fitted poses against the fitter: poses-1's record (`poses/`,
// written by `film concept fit`) is what the fitter reaches again from the
// same start on the kept poses-1 crop, from the puppet the record names,
// with the same loss; the other puppet's loss is the one recorded, and no
// lower. It decodes his sheets and draws his puppets on the CPU, so it runs
// in the slow suite.

import { boxStart, fitPose } from '@manna/film/core';
import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { puppetFor } from './puppet.ts';
import { POSES } from './poses.ts';
import FIT from './poses/poses-poses-1.json' with { type: 'json' };
import sharp from 'sharp';

const HERE = import.meta.dir;

/** The kept poses sheet cut at poses-1's box. */
const [x0, y0, x1, y1] = POSES['poses-1'].box;
const keptPoses1 = Effect.promise(() =>
  sharp(`${HERE}/../cast-sheet/kept/poses.png`)
    .extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true }),
).pipe(
  Effect.map(({ data, info }) => ({
    width: info.width,
    height: info.height,
    rgba: new Uint8Array(data),
  })),
);

describe("the lead's fitted poses", () => {
  it.effect("poses-1's fit reaches its recorded rows", () =>
    Effect.gen(function* () {
      const crop = yield* keptPoses1;
      const fitted = POSES['poses-1'];
      const scores: Record<string, number> = {};
      for (const view of ['front', 'threeQuarterLeft'] as const) {
        const puppet = yield* puppetFor(view);
        const made = fitPose(puppet, crop, {
          bones: FIT.bones,
          start: boxStart(puppet, crop),
          reach: 15,
        });
        scores[view] = made.loss;
        expect(made.loss).toBeCloseTo(fitted.scores[view], 3);
        if (view !== fitted.from) continue;
        expect(made.root[0]).toBeCloseTo(fitted.pose.root[0], 4);
        expect(made.root[1]).toBeCloseTo(fitted.pose.root[1], 4);
        expect(made.scale).toBeCloseTo(fitted.pose.scale, 5);
        for (const b of FIT.bones)
          expect(made.numbers[b] ?? 0).toBeCloseTo(fitted.pose.numbers[b] ?? 0, 4);
      }
      // the record's puppet is the one with the lower loss
      expect(scores[fitted.from]).toBe(Math.min(scores['front']!, scores['threeQuarterLeft']!));
    }),
  );
});
