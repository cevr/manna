// A puppet drawn by the page's draw path (`drawPuppet`, WebGL 2) against its
// CPU reference (`rasterOf`): a fixture puppet (a two-bone sleeve over a
// body, each pixel its own colour) at rest byte for byte, at 20 seeded poses
// within ΔE 1 and IoU 0.99; the fold pose (the forearm turned 150° back
// over the upper arm, one part's triangles over one pixel) within ΔE 1 on
// average and 2 at any pixel; 60 frames drawn in a shuffled order equal to the
// same frames in order; the L3 pass's reach; a turned drawn key's pixels, its
// light rim with them, left as drawn under the sheet's line (as the frame
// without a line draws them); and a part PNG's bytes in the key of a beat whose
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

const [LW, LH] = [200, 140];

/** A larger fixture for the line: a sleeve band from (24, 40) to (104, 54) over a body box, each with a 3 px ink edge, once with the sheet's line declared and once bare; and a drawn key of the sleeve, a 2 px light rim outside its 3 px ink edge, as a drawn key's halo stands. */
const LINED_MODULE = `import arm from './arm.png' with { type: 'file' };
import body from './body.png' with { type: 'file' };
import key from './key.png' with { type: 'file' };
const base = {
  size: [${LW}, ${LH}],
  parts: [{ name: 'arm', png: arm }, { name: 'body', png: body }],
  drawings: [{ name: 'key', png: key }],
  skeleton: {
    bones: [
      { name: 'lean', pivot: [80, 120], tip: [80, 60] },
      { name: 'shoulderRight', parent: 'lean', pivot: [100, 47], tip: [24, 47] },
    ],
    skin: { arm: ['shoulderRight'], body: ['lean'] },
    root: [80, 120],
  },
  origin: [0, 0],
};
export const LINED = { ...base, key: 'fixture/lined', line: { width: 3, ink: [30, 24, 20] } };
export const BARE = { ...base, key: 'fixture/bare' };
`;

/** Each part's paint (sleeve, body), then the ink of its edge. */
const INK_OR = [
  [
    [236, 226, 200, 255],
    [70, 120, 150, 255],
  ],
  [
    [30, 24, 20, 255],
    [30, 24, 20, 255],
  ],
] as const;

const ARM_BOX = [24, 40, 104, 54] as const;
const BODY_BOX = [50, 44, 150, 130] as const;
/** The drawn key's light rim, outside its ink. */
const KEY_HALO = [250, 244, 230, 255] as const;

const layLined = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const arm = new Uint8Array(LW * LH * 4);
    const body = new Uint8Array(LW * LH * 4);
    const key = new Uint8Array(LW * LH * 4);
    const within = (
      x: number,
      y: number,
      b: readonly [number, number, number, number],
      k: number,
    ) => x >= b[0] + k && x < b[2] - k && y >= b[1] + k && y < b[3] - k;
    const inked = (x: number, y: number, b: readonly [number, number, number, number]) =>
      !within(x, y, b, 3);
    for (let y = 0; y < LH; y++)
      for (let x = 0; x < LW; x++) {
        const i = (y * LW + x) * 4;
        if (within(x, y, ARM_BOX, 0)) {
          arm.set(INK_OR[Number(inked(x, y, ARM_BOX))]![0], i);
          if (within(x, y, ARM_BOX, 2)) key.set(INK_OR[Number(!within(x, y, ARM_BOX, 5))]![0], i);
          else key.set(KEY_HALO, i);
        } else if (within(x, y, BODY_BOX, 0))
          body.set(INK_OR[Number(inked(x, y, BODY_BOX))]![1], i);
      }
    yield* fs.writeFile(path.join(dir, 'arm.png'), encodePng({ width: LW, height: LH, rgba: arm }));
    yield* fs.writeFile(path.join(dir, 'key.png'), encodePng({ width: LW, height: LH, rgba: key }));
    yield* fs.writeFile(
      path.join(dir, 'body.png'),
      encodePng({ width: LW, height: LH, rgba: body }),
    );
    yield* fs.writeFileString(path.join(dir, 'spec.ts'), LINED_MODULE);
  });

/** `m` (`LW` × `LH`) grown by `k` px (Euclidean, brute force over the disc). */
const grown = (m: Uint8Array, k: number) => {
  const out = new Uint8Array(m.length);
  for (let y = 0; y < LH; y++)
    for (let x = 0; x < LW; x++) {
      if (!m[y * LW + x]) continue;
      for (let dy = -k; dy <= k; dy++)
        for (let dx = -k; dx <= k; dx++) {
          const [X, Y] = [x + dx, y + dy];
          if (X >= 0 && Y >= 0 && X < LW && Y < LH && dx * dx + dy * dy <= k * k)
            out[Y * LW + X] = 1;
        }
    }
  return out;
};

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
  let [both, any, sum, worst] = [0, 0, 0, 0];
  for (let i = 0; i < a.width * a.height; i++) {
    const [fa, fb] = [a.rgba[i * 4 + 3]! >= 128, b.rgba[i * 4 + 3]! >= 128];
    if (!fa && !fb) continue;
    any++;
    if (fa && fb) both++;
    const [p, q] = [over(a, i), over(b, i)];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    sum += d;
    worst = Math.max(worst, d);
  }
  return { deltaE: sum / Math.max(1, any), iou: both / Math.max(1, any), worst };
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

  it.live('the fold pose elbowRight 150 draws alike on the CPU and the GL', () =>
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
        // the forearm turned back over the upper arm: two triangles of one part over one pixel, laid in turn on both paths
        const pose: PuppetPose = { numbers: { elbowRight: 150 }, root: [45, 60], scale: 1 };
        const m = against(yield* page.draw(pose), rasterOf(puppet, pose));
        expect(m.deltaE).toBeLessThanOrEqual(1);
        expect(m.iou).toBeGreaterThanOrEqual(0.99);
        // every pixel, the fold's among them: measured 1.04 at most (2026-10-28)
        expect(m.worst).toBeLessThanOrEqual(2);
      }),
    ).pipe(Effect.provide(Layer.provideMerge(PuppetImagesBun, BunServices.layer))),
  );

  it.live(
    'still at scale 0.9 draws alike on the CPU and the GL, the seals under the lines among them',
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
          // no part turned, at a fractional scale: each seal drawn under the line it closes, on both paths
          const pose: PuppetPose = { numbers: {}, root: [45, 60], scale: 0.9 };
          const m = against(yield* page.draw(pose), rasterOf(puppet, pose));
          expect(m.deltaE).toBeLessThanOrEqual(1);
          expect(m.iou).toBeGreaterThanOrEqual(0.99);
          expect(m.worst).toBeLessThanOrEqual(2);
        }),
      ).pipe(Effect.provide(Layer.provideMerge(PuppetImagesBun, BunServices.layer))),
  );

  it.live('the L3 pass leaves every pixel farther than 16 px from a moved part unchanged', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = yield* fs.makeTempDirectoryScoped();
        yield* layLined(dir);
        const module = path.join(dir, 'spec.ts');
        const { BARE } = yield* Effect.promise(() => import(module));
        const lined = yield* puppetPage({ module, name: 'LINED' });
        const bare = yield* puppetPage({ module, name: 'BARE' });
        const pose: PuppetPose = { numbers: { shoulderRight: -35 }, root: [80, 120], scale: 1 };
        const look = { boil: 5 };
        const [a, b] = [yield* lined.draw(pose, look), yield* bare.draw(pose, look)];
        // what moved, now and at rest: the sleeve's own coverage on the CPU
        const puppet = yield* puppetFrom(BARE);
        const sleeve = { ...puppet, parts: puppet.parts.filter((p) => p.name === 'arm') };
        const [now, rest] = [rasterOf(sleeve, pose), rasterOf(sleeve, { ...pose, numbers: {} })];
        const moved = (i: number) => now.rgba[i * 4 + 3]! > 0 || rest.rgba[i * 4 + 3]! > 0;
        const near = Uint8Array.from({ length: LW * LH }, (_, i) => Number(moved(i)));
        // the boil moves a pixel's sample by under 1 px: 16 and the sample's reach
        const within = grown(near, 17);
        let [changed, far] = [0, 0];
        for (let i = 0; i < LW * LH; i++) {
          const differs = [0, 1, 2, 3].some((c) => a.rgba[i * 4 + c] !== b.rgba[i * 4 + c]);
          changed += Number(differs);
          far += Number(differs && within[i] === 0);
        }
        expect(changed).toBeGreaterThan(50);
        expect(far).toBe(0);
        // the page draws the far figure, not nothing
        let farFigure = 0;
        for (let i = 0; i < LW * LH; i++)
          farFigure += Number(within[i] === 0 && a.rgba[i * 4 + 3]! > 0);
        expect(farFigure).toBeGreaterThan(1000);
      }),
    ).pipe(Effect.provide(Layer.provideMerge(PuppetImagesBun, BunServices.layer))),
  );

  it.live("leaves a turned drawn key's pixels, its light rim with them, as drawn", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = yield* fs.makeTempDirectoryScoped();
        yield* layLined(dir);
        const module = path.join(dir, 'spec.ts');
        const lined = yield* puppetPage({ module, name: 'LINED' });
        const bare = yield* puppetPage({ module, name: 'BARE' });
        const pose: PuppetPose = { numbers: {}, root: [80, 120], scale: 1 };
        const [pivot, theta] = [[100, 47] as const, 10];
        const look = {
          boil: 0,
          amp: 0,
          swap: { part: 'arm', drawing: 'key', place: { s: 1, dx: 0, dy: 0 }, pivot, theta },
        };
        const [a, b] = [yield* lined.draw(pose, look), yield* bare.draw(pose, look)];
        // the key's own pixels in the frame, each a px inside its edge, off the body
        const [c, s] = [Math.cos((theta * Math.PI) / 180), Math.sin((theta * Math.PI) / 180)];
        let [covered, rim, differs] = [0, 0, 0];
        for (let y = 0; y < LH; y++)
          for (let x = 0; x < LW; x++) {
            const [qx, qy] = [x + 0.5 - pivot[0], y + 0.5 - pivot[1]];
            const [u, v] = [pivot[0] + c * qx + s * qy, pivot[1] - s * qx + c * qy];
            const inside =
              u >= ARM_BOX[0] + 1 &&
              u < ARM_BOX[2] - 1 &&
              v >= ARM_BOX[1] + 1 &&
              v < ARM_BOX[3] - 1;
            const onBody = x >= BODY_BOX[0] && y >= BODY_BOX[1];
            if (!inside || onBody) continue;
            covered++;
            const i = y * LW + x;
            rim += Number([0, 1, 2].every((k) => Math.abs(a.rgba[i * 4 + k]! - KEY_HALO[k]!) <= 2));
            differs += Number([0, 1, 2, 3].some((k) => a.rgba[i * 4 + k] !== b.rgba[i * 4 + k]));
          }
        expect(covered).toBeGreaterThan(400);
        expect(rim).toBeGreaterThan(60);
        expect(differs).toBe(0);
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
