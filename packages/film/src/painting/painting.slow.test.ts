// A painted plate in the page: a fixture PNG with alpha (a clear left band, an
// opaque red over blue body, a half-clear green band at its right) decoded by
// the page's decoder (`PaintingImagesBrowser`), loaded on a film
// (`loadPaintings`) and painted by `f.painting` under a scene transform off the
// identity (the film's breath, then the scene's own translate and scale), in
// the render path's Chrome. The plate lands where `paintingQuad` puts it, its
// opaque paint keeps its colour, its clear band leaves the frame as the bare
// film draws it, and its half-clear band and its keyed edge blend the paper
// and the paint without darkening either (premultiplied alpha). Each case
// opens Chrome, so it runs in the slow suite.

import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Path } from 'effect';
import { type PaintingSpec, paintingQuad } from '../canvas/painting.ts';
import type { Raster } from '../core/raster.ts';
import { encodePng } from '../tools/png.ts';
import { type PlateFrames, plateFrames } from './fixtures/page.ts';

const [W, H] = [64, 48];
const RED = [200, 40, 40] as const;
const BLUE = [40, 60, 200] as const;
const GREEN = [40, 200, 80] as const;
/** The green band's alpha: half clear. */
const HALF = 128;
/** The clear band's width, at the plate's open left edge. */
const CLEAR = 16;
/** Where the half-clear green band starts. */
const BAND = 48;

/** The plate's RGBA: clear left of `CLEAR`, red above blue, green at `HALF` alpha from `BAND`. */
const plateRgba = () => {
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = CLEAR; x < W; x++) {
      const i = (y * W + x) * 4;
      if (x >= BAND) rgba.set([...GREEN, HALF], i);
      else if (y < H / 2) rgba.set([...RED, 255], i);
      else rgba.set([...BLUE, 255], i);
    }
  return rgba;
};

const AT = [10, 20] as const;
const SCALE = 2;

const SPEC_MODULE = `import png from './plate.png' with { type: 'file' };
export const PLATE = { key: 'fixture/plate', png, size: [${W}, ${H}], at: [${AT.join(', ')}], scale: ${SCALE}, open: ['left'] };
`;

/** The same spec in Bun, for the quad (its png is never read here). */
const SPEC: PaintingSpec = {
  key: 'fixture/plate',
  png: 'plate.png',
  size: [W, H],
  at: AT,
  scale: SCALE,
  open: ['left'],
};

/** The plate's module and PNG written into `dir`. */
const lay = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.writeFile(
      path.join(dir, 'plate.png'),
      encodePng({ width: W, height: H, rgba: plateRgba() }),
    );
    yield* fs.writeFileString(path.join(dir, 'spec.ts'), SPEC_MODULE);
  });

/** The screen pixel the plate pixel (u, v)'s centre lands on, under `m`. */
const screenOf = (m: PlateFrames['matrix'], u: number, v: number) => {
  const px = AT[0] + SCALE * (u + 0.5);
  const py = AT[1] + SCALE * (v + 0.5);
  return [Math.floor(m.a * px + m.c * py + m.e), Math.floor(m.b * px + m.d * py + m.f)] as const;
};

const rgbAt = (r: Raster, x: number, y: number) => {
  const i = (y * r.width + x) * 4;
  return [r.rgba[i]!, r.rgba[i + 1]!, r.rgba[i + 2]!] as const;
};

/** The largest channel difference between two colours. */
const off = (p: ReadonlyArray<number>, q: ReadonlyArray<number>) =>
  Math.max(...p.map((c, k) => Math.abs(c - q[k]!)));

const luma = (p: ReadonlyArray<number>) => 0.299 * p[0]! + 0.587 * p[1]! + 0.114 * p[2]!;

/** The box of the pixels where the two frames differ by more than `by` in a channel. */
const differs = (a: Raster, b: Raster, by: number) => {
  let [x0, y0, x1, y1] = [a.width, a.height, -1, -1];
  for (let y = 0; y < a.height; y++)
    for (let x = 0; x < a.width; x++)
      if (off(rgbAt(a, x, y), rgbAt(b, x, y)) > by) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  return { x0, y0, x1, y1 };
};

describe('a painted plate in the page', () => {
  it.live(
    'f.painting draws the decoded PNG where its quad says, its paint true and its alpha edges blended, off the identity',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const dir = yield* fs.makeTempDirectoryScoped();
          yield* lay(dir);
          const { painted, bare, matrix } = yield* plateFrames({
            module: path.join(dir, 'spec.ts'),
            name: 'PLATE',
            move: { x: 301.25, y: 203.5, s: 1.5 },
            T: 1,
          });
          // the scene's transform is off the identity (the breath scales about the frame's centre, then the scene's move): no turn
          expect(matrix.a).toBeGreaterThan(1.4);
          expect(matrix.e).toBeGreaterThan(200);
          expect(Math.abs(matrix.b) + Math.abs(matrix.c)).toBeLessThan(1e-6);

          // where the frames differ is the plate's quad, but its clear band: right, top and bottom on the quad, left at the band's edge
          const quad = paintingQuad(matrix, SPEC);
          const box = differs(painted, bare, 2);
          const edgeX = matrix.a * (AT[0] + SCALE * CLEAR) + matrix.e;
          expect(Math.abs(box.x1 + 1 - quad[1][0])).toBeLessThanOrEqual(1.5);
          expect(Math.abs(box.y0 - quad[0][1])).toBeLessThanOrEqual(1.5);
          expect(Math.abs(box.y1 + 1 - quad[2][1])).toBeLessThanOrEqual(1.5);
          // the smoothing spreads the keyed edge over half a plate px on its clear side
          expect(Math.abs(box.x0 - edgeX)).toBeLessThanOrEqual((matrix.a * SCALE) / 2 + 1);

          // the opaque paint keeps its colour
          expect(off(rgbAt(painted, ...screenOf(matrix, 32, 10)), RED)).toBeLessThanOrEqual(3);
          expect(off(rgbAt(painted, ...screenOf(matrix, 32, 36)), BLUE)).toBeLessThanOrEqual(3);

          // the clear band leaves the bare frame as it was
          const clear = screenOf(matrix, 6, 24);
          expect(off(rgbAt(painted, ...clear), rgbAt(bare, ...clear))).toBe(0);

          // the half-clear band is paint over paper at its alpha, not darker
          const half = screenOf(matrix, 56, 12);
          const a = HALF / 255;
          const blended = rgbAt(bare, ...half).map((c, k) => c * (1 - a) + GREEN[k]! * a);
          expect(off(rgbAt(painted, ...half), blended)).toBeLessThanOrEqual(3);

          // across the keyed edge (clear to red), each pixel lies between the paper and the paint: none darker than both
          const [, y] = screenOf(matrix, 32, 10);
          const from = Math.floor(edgeX) - 4;
          let soft = 0;
          for (let x = from; x <= from + 8; x++) {
            const [p, paper] = [rgbAt(painted, x, y), rgbAt(bare, x, y)];
            expect(luma(p)).toBeGreaterThanOrEqual(Math.min(luma(paper), luma(RED)) - 2);
            for (let k = 0; k < 3; k++) {
              expect(p[k]!).toBeGreaterThanOrEqual(Math.min(paper[k]!, RED[k]!) - 3);
              expect(p[k]!).toBeLessThanOrEqual(Math.max(paper[k]!, RED[k]!) + 3);
            }
            soft += Number(off(p, paper) > 3 && off(p, RED) > 3);
          }
          expect(off(rgbAt(painted, from, y), rgbAt(bare, from, y))).toBeLessThanOrEqual(1);
          expect(off(rgbAt(painted, from + 8, y), RED)).toBeLessThanOrEqual(3);
          // the edge is drawn smooth (high-quality smoothing), not cut on one pixel
          expect(soft).toBeGreaterThanOrEqual(1);
        }),
      ).pipe(Effect.provide(BunServices.layer)),
  );
});
