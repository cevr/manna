// The lead's puppets against his kept views (`cast-sheet/views/`): each
// view's declared paper is its kept ground's; at rest every pixel the cut
// left opaque is the kept pixel byte for byte, and the rim the un-matte
// solved (`core/unmatte.ts`) is the kept view within ΔE 1 on the mean over
// the parts' pixels; laid on the page's paper, his rim shows no ring of the
// sheet's paper (the rim pixels lighter than that paper by L* 2, at most 5 %
// of the rim), and outside the kept figure no more than 1 % of the 3 px ring
// is lighter (front and three-quarter: heads-4's figure reading leaves its
// open bottom edge to the ground, so its ring holds his tunic). Each case
// decodes his sheets, so they run in the slow suite.

import { figureOf, labOf, rasterOf, restPose } from '@manna/film/core';
import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { puppetFor } from './puppet.ts';
import { PAPERS } from './puppets.ts';
import sharp from 'sharp';

type Rgb = readonly [number, number, number];
interface Raster {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

const HERE = import.meta.dir;
const PAGE: Rgb = [238, 221, 200];
const VIEWS = ['front', 'threeQuarterLeft', 'heads-4'] as const;

const keptOf = (view: string) =>
  Effect.promise(() =>
    sharp(`${HERE}/../cast-sheet/views/${view}.png`)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
  ).pipe(
    Effect.map(({ data, info }): Raster => ({
      width: info.width,
      height: info.height,
      rgba: new Uint8Array(data),
    })),
  );

const rgbAt = (r: Raster, i: number): Rgb => [
  r.rgba[i * 4]!,
  r.rgba[i * 4 + 1]!,
  r.rgba[i * 4 + 2]!,
];

/** `r` laid over the flat `paper`, each channel unrounded. */
const over = (r: Raster, i: number, paper: Rgb): Rgb => {
  const a = r.rgba[i * 4 + 3]! / 255;
  return [0, 1, 2].map((c) => r.rgba[i * 4 + c]! * a + paper[c]! * (1 - a)) as unknown as Rgb;
};

const dE = (a: Rgb, b: Rgb) => {
  const [p, q] = [labOf(a), labOf(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

/** Whether a px within `r` (euclidean) of (x, y) passes `m`. */
const within = (
  w: number,
  h: number,
  x: number,
  y: number,
  r: number,
  m: (j: number) => boolean,
) => {
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const [u, v] = [x + dx, y + dy];
      if (u >= 0 && v >= 0 && u < w && v < h && Math.hypot(dx, dy) <= r && m(v * w + u))
        return true;
    }
  return false;
};

/** The median of the kept view's border px its figure reading leaves to the ground. */
const borderPaper = (kept: Raster, figure: Uint8Array) => {
  const { width: w, height: h } = kept;
  const border: number[][] = [[], [], []];
  for (let i = 0; i < w * h; i++) {
    const [x, y] = [i % w, Math.floor(i / w)];
    if (figure[i] || (x > 2 && y > 2 && x < w - 3 && y < h - 3)) continue;
    rgbAt(kept, i).forEach((v, c) => border[c]!.push(v));
  }
  return border.map((vs) => vs.sort((a, b) => a - b)[vs.length >> 1]!);
};

/**
 * The rest raster over `paper` against the kept view, over his figure and
 * every px a part holds (a rim px the un-matte gave to the paper is in his
 * figure): opaque px that are not the kept px, and the mean dE.
 */
const restAgainst = (
  rest: Raster,
  kept: Raster,
  figure: Uint8Array,
  held: Uint8Array,
  paper: Rgb,
) => {
  let [owned, sum, opaqueOff] = [0, 0, 0];
  for (let i = 0; i < kept.width * kept.height; i++) {
    if (!figure[i] && !held[i]) continue;
    owned++;
    if (rest.rgba[i * 4 + 3] === 255 && rgbAt(rest, i).some((v, c) => v !== kept.rgba[i * 4 + c]))
      opaqueOff++;
    sum += dE(over(rest, i, paper), rgbAt(kept, i));
  }
  return { opaqueOff, meanDeltaE: sum / owned };
};

/** Of the px `among` marks, the share that the rest raster on the page's paper shows lighter than that paper by L* 2. */
const lighterShare = (rest: Raster, among: (x: number, y: number, i: number) => boolean) => {
  const L = labOf(PAGE)[0];
  let [n, light] = [0, 0];
  for (let y = 0; y < rest.height; y++)
    for (let x = 0; x < rest.width; x++) {
      const i = y * rest.width + x;
      if (!among(x, y, i)) continue;
      n++;
      if (labOf(over(rest, i, PAGE))[0] > L + 2) light++;
    }
  return light / Math.max(1, n);
};

describe("the lead's puppets", () => {
  for (const view of VIEWS)
    it.live(
      `${view}: at rest is his kept view, and on another paper shows no ring of the sheet's`,
      () =>
        Effect.gen(function* () {
          const kept = yield* keptOf(view);
          const puppet = yield* puppetFor(view);
          const rest = rasterOf(puppet, restPose(puppet));
          const { width: w, height: h } = kept;
          const paper = PAPERS[view];
          const figure = figureOf(kept).figure;
          borderPaper(kept, figure).forEach((v, c) =>
            expect(Math.abs(v - paper[c]!)).toBeLessThanOrEqual(1),
          );
          const held = new Uint8Array(w * h);
          for (const p of puppet.parts)
            for (let i = 0; i < w * h; i++) if (p.pixels.rgba[i * 4 + 3]! > 0) held[i] = 1;
          const against = restAgainst(rest, kept, figure, held, paper);
          expect(against.opaqueOff).toBe(0);
          expect(against.meanDeltaE).toBeLessThanOrEqual(1);
          const clear = (j: number) => rest.rgba[j * 4 + 3] === 0;
          // the rim: px a part holds within 2 px of the parts' ground
          const rim = lighterShare(rest, (x, y, i) => !clear(i) && within(w, h, x, y, 2, clear));
          expect(rim).toBeLessThanOrEqual(0.05);
          if (view === 'heads-4') return;
          // the 3 px ring outside the kept figure
          const ring = lighterShare(
            rest,
            (x, y, i) => !figure[i] && within(w, h, x, y, 3, (j) => figure[j] === 1),
          );
          expect(ring).toBeLessThanOrEqual(0.01);
        }),
    );
});
