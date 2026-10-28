// A puppet drawn by the page's draw path (`drawPuppet`, WebGL 2) against its
// CPU reference (`rasterOf`): a fixture puppet (a two-bone sleeve over a
// body, each pixel its own colour) at rest byte for byte, at 20 seeded poses
// within ΔE 1 and IoU 0.99; 60 frames drawn in a shuffled order equal to the
// same frames in order; and a part PNG's bytes in the key of a beat whose
// scene imports the puppet (`tools/stamp.ts`). Each case opens Chrome or
// writes a film, so they run in the slow suite.

import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Layer, Path } from 'effect';
import { labOf } from '../core/cast-sheet-pixels.ts';
import { type PuppetPose, rasterOf } from '../core/puppet.ts';
import type { Raster } from '../core/raster.ts';
import { encodePng } from '../tools/png.ts';
import { handBeatKey } from './fixtures/key.ts';
import { puppetPage } from './fixtures/page.ts';
import { puppetFrom } from './load.ts';
import { PuppetImagesBun } from './images-bun.ts';

const [W, H] = [96, 64];

/** The fixture's two parts: a sleeve (a band from (10, 26) to (86, 38)) over a body (a box below it). */
const partsOf = (tint = 0) => {
  const arm = new Uint8Array(W * H * 4);
  const body = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (x >= 10 && x < 86 && y >= 26 && y < 38)
        arm.set([40 + x * 2, 200 - y * 3, (x * 7 + tint) % 256, 255], i);
      else if (x >= 20 && x < 70 && y >= 30 && y < 60) body.set([210 - y, 90 + x, 60, 255], i);
    }
  return { arm, body };
};

const SPEC_MODULE = `import arm from './arm.png' with { type: 'file' };
import body from './body.png' with { type: 'file' };
export const SPEC = {
  key: 'fixture/sleeve',
  size: [${W}, ${H}],
  parts: [{ name: 'arm', png: arm }, { name: 'body', png: body }],
  skeleton: {
    bones: [
      { name: 'lean', pivot: [45, 60], tip: [45, 30] },
      { name: 'shoulderRight', parent: 'lean', pivot: [14, 32], tip: [48, 32] },
      { name: 'elbowRight', parent: 'shoulderRight', pivot: [48, 32], tip: [84, 32] },
    ],
    skin: { arm: ['shoulderRight', 'elbowRight'], body: ['lean'] },
    root: [45, 60],
  },
  origin: [0, 0],
};
`;

/** The fixture puppet's module and part PNGs written into `dir`, the sleeve tinted by `tint`. */
const lay = (dir: string, tint = 0) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { arm, body } = partsOf(tint);
    yield* fs.writeFile(path.join(dir, 'arm.png'), encodePng({ width: W, height: H, rgba: arm }));
    yield* fs.writeFile(path.join(dir, 'body.png'), encodePng({ width: W, height: H, rgba: body }));
    yield* fs.writeFileString(path.join(dir, 'spec.ts'), SPEC_MODULE);
  });

const rng = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const poseOf = (seed: number): PuppetPose => {
  const r = rng(seed * 7919 + 1);
  return {
    numbers: { shoulderRight: -40 + r() * 80, elbowRight: -50 + r() * 100, lean: -6 + r() * 12 },
    root: [45 + Math.round(r() * 4 - 2), 60],
    scale: 1,
  };
};

/** Mean ΔE76 over the union of the two figures (alpha over half), each laid over one paper, and their IoU. */
const against = (a: Raster, b: Raster) => {
  const P = [242, 234, 218];
  const over = (r: Raster, i: number) => {
    const al = r.rgba[i * 4 + 3]! / 255;
    return labOf(
      [0, 1, 2].map((c) => r.rgba[i * 4 + c]! * al + P[c]! * (1 - al)) as [number, number, number],
    );
  };
  let [both, any, sum] = [0, 0, 0];
  for (let i = 0; i < a.width * a.height; i++) {
    const [fa, fb] = [a.rgba[i * 4 + 3]! >= 128, b.rgba[i * 4 + 3]! >= 128];
    if (!fa && !fb) continue;
    any++;
    if (fa && fb) both++;
    const [p, q] = [over(a, i), over(b, i)];
    sum += Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  }
  return { deltaE: sum / Math.max(1, any), iou: both / Math.max(1, any) };
};

const hashOf = (r: Raster) => new Bun.CryptoHasher('sha256').update(r.rgba).digest('hex');

describe('a puppet in the page', () => {
  it.live(
    'draws its CPU raster: at rest byte for byte, at 20 seeded poses within ΔE 1 and IoU 0.99, and 60 frames in a shuffled order as in order',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const dir = yield* fs.makeTempDirectoryScoped();
          yield* lay(dir);
          const module = path.join(dir, 'spec.ts');
          const { SPEC } = yield* Effect.promise(() => import(module));
          const puppet = yield* puppetFrom(SPEC);
          const page = yield* puppetPage({ module, name: 'SPEC' });
          const rest: PuppetPose = { numbers: {}, root: [45, 60], scale: 1 };
          expect(hashOf(yield* page.draw(rest))).toBe(hashOf(rasterOf(puppet, rest)));
          for (let seed = 1; seed <= 20; seed++) {
            const pose = poseOf(seed);
            const m = against(yield* page.draw(pose), rasterOf(puppet, pose));
            expect(m.deltaE).toBeLessThanOrEqual(1);
            expect(m.iou).toBeGreaterThanOrEqual(0.99);
          }
          const frames = Array.from({ length: 60 }, (_, f) => poseOf(100 + (f % 30)));
          const inOrder: string[] = [];
          for (const pose of frames) inOrder.push(hashOf(yield* page.draw(pose)));
          const order = Array.from({ length: 60 }, (_, f) => f);
          const r = rng(60);
          for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(r() * (i + 1));
            [order[i], order[j]] = [order[j]!, order[i]!];
          }
          const shuffled: string[] = Array.from({ length: 60 }, () => '');
          for (const f of order) shuffled[f] = hashOf(yield* page.draw(frames[f]!));
          expect(shuffled).toEqual(inOrder);
          expect(new Set(inOrder).size).toBe(30);
        }),
      ).pipe(Effect.provide(Layer.provideMerge(PuppetImagesBun, BunServices.layer))),
  );

  it.live("changes the key of a beat that draws it when a part PNG's bytes change", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const keyed = (tint: number) =>
        handBeatKey('../puppet/spec.ts', (film) =>
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            const dir = path.join(film, 'puppet');
            yield* fs.makeDirectory(dir, { recursive: true });
            yield* lay(dir, tint);
          }),
        );
      const [before, again, after] = [yield* keyed(0), yield* keyed(0), yield* keyed(1)];
      expect(before).toBe(again);
      expect(after).not.toBe(before);
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
