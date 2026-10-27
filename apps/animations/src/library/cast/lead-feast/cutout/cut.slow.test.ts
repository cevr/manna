// The series lead's kept front and three-quarter views cut by his cut table
// (`cut.ts`): every part he names holds pixels, the parts recompose each view
// byte for byte, the paper between his sandals is no part's, and each joint
// lies on its own arm.

import { cutParts, recompose } from '@manna/film/tools';
import { Effect, Result } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import sharp from 'sharp';
import { CUTS, CUT_OPTIONS, JOINTS } from './cut.ts';

const VIEWS = `${import.meta.dir}/../cast-sheet/views`;

/** A kept view's RGBA bytes. */
const viewOf = (name: string) =>
  Effect.promise(() =>
    sharp(`${VIEWS}/${name}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ).pipe(
    Effect.map(({ data, info }) => ({
      width: info.width,
      height: info.height,
      rgba: new Uint8Array(data),
    })),
  );

/** sRGB as CIE Lab (D65). */
const labOf = (r: number, g: number, b: number) => {
  const lin = (v: number) =>
    [((v / 255 + 0.055) / 1.055) ** 2.4, v / 255 / 12.92][Number(v / 255 <= 0.04045)] ?? 0;
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const f = (t: number) =>
    [((24389 / 27) * t + 16) / 116, Math.cbrt(t)][Number(t > 216 / 24389)] ?? 0;
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)] as const;
};

/** The four-way piece of `near` from `s`, marked in `seen`, and whether it reaches the border. */
const pieceFrom = (near: Uint8Array, seen: Uint8Array, w: number, s: number) => {
  const piece = [s];
  let border = false;
  seen[s] = 1;
  for (let q = 0; q < piece.length; q++) {
    const i = piece[q] ?? 0;
    const [x, y] = [i % w, Math.floor(i / w)];
    border ||= x === 0 || y === 0 || x === w - 1 || y >= near.length / w - 1;
    const steps = [
      [x > 0, i - 1],
      [x < w - 1, i + 1],
      [y > 0, i - w],
      [true, i + w],
    ] as const;
    for (const [inside, j] of steps)
      if (inside && j < near.length && near[j] === 1 && seen[j] === 0) {
        seen[j] = 1;
        piece.push(j);
      }
  }
  return { piece, border };
};

/** The paper his ink closes round: pixels within ΔE76 3 of the border's median paper, in pieces of 24 px or more, 8 px across both ways, that never reach the border (between his sandals). */
const enclosedPaper = (v: { width: number; height: number; rgba: Uint8Array }) => {
  const { width: w, height: h, rgba } = v;
  const labs = Array.from({ length: w * h }, (_, i) =>
    labOf(rgba[i * 4] ?? 0, rgba[i * 4 + 1] ?? 0, rgba[i * 4 + 2] ?? 0),
  );
  const rim = labs.filter((_, i) => i % w === 0 || i % w === w - 1 || i < w || i >= w * (h - 1));
  const med = [0, 1, 2].map(
    (c) => rim.map((l) => l[c] ?? 0).sort((a, b) => a - b)[rim.length >> 1] ?? 0,
  );
  const near = Uint8Array.from(labs, (l) =>
    Number(Math.hypot(l[0] - (med[0] ?? 0), l[1] - (med[1] ?? 0), l[2] - (med[2] ?? 0)) < 3),
  );
  const out = new Uint8Array(w * h);
  const seen = new Uint8Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (near[s] === 0 || seen[s] === 1) continue;
    const { piece, border } = pieceFrom(near, seen, w, s);
    const xs = piece.map((i) => i % w);
    const ys = piece.map((i) => Math.floor(i / w));
    const wide = Math.max(...xs) - Math.min(...xs) >= 8 && Math.max(...ys) - Math.min(...ys) >= 8;
    if (!border && piece.length >= 24 && wide) for (const i of piece) out[i] = 1;
  }
  return out;
};

describe("the series lead's cut", () => {
  for (const name of ['front', 'threeQuarterLeft'] as const)
    it.effect(
      `his ${name} cuts into parts that recompose it byte for byte, the paper between his sandals no part's`,
      () =>
        Effect.gen(function* () {
          const view = yield* viewOf(name);
          const sheet = Result.getOrThrow(cutParts(view, CUTS[name], CUT_OPTIONS[name]));
          expect(sheet.parts.map((p) => p.name)).toEqual([
            'armRight',
            'armLeft',
            'head',
            'sash',
            'footRight',
            'footLeft',
            'shadow',
            'robe',
            'torso',
          ]);
          expect(sheet.parts.filter((p) => p.kept === 0).map((p) => p.name)).toEqual([]);
          expect(recompose(sheet, view).rgba).toEqual(view.rgba);
          const paper = enclosedPaper(view);
          expect(paper.reduce((s, v) => s + v, 0)).toBeGreaterThan(400);
          expect(paper.filter((v, i) => v === 1 && sheet.owner[i] !== 0).length).toBe(0);
          const arm = (joint: string) =>
            sheet.parts.findIndex(
              (p) => p.name === `arm${['Left', 'Right'][Number(joint.endsWith('Right'))]}`,
            ) + 1;
          for (const [joint, [x, y]] of Object.entries(JOINTS[name]))
            expect([joint, sheet.owner[y * view.width + x]]).toEqual([joint, arm(joint)]);
        }),
    );
});
