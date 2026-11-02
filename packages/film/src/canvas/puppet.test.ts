// A look's drawn keys as the draw path lays them where nothing paints (Bun,
// `check --draw`): each key's quad is written into its part's swap buffer,
// the buffer the page draws it from (`canvas/puppet-gl.ts`), canvas px. The
// figure stands under an unturned frame with our origin at the sheet's
// corner and its root where the sheet's is, so canvas px are sheet px.

import { describe, expect, test } from 'bun:test';
import { Result } from 'effect';
import { type PuppetPose, type Skeleton, puppetOf } from '../core/puppet.ts';
import type { Raster } from '../core/raster.ts';
import { type LoadedPuppet, type PuppetLook, type PuppetSpec, drawPuppet } from './puppet.ts';
import { puppetGl } from './puppet-gl.ts';

type Pt = readonly [number, number];

const [W, H] = [100, 110];
const ROOT: Pt = [51, 105];

/** A part's pixels: opaque over `[x0, x1) × [y0, y1)`, sheet px (a mesh's 3 px grid holds each corner as a vertex). */
const block = (x0: number, y0: number, x1: number, y1: number): Raster => {
  const rgba = new Uint8Array(W * H * 4);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) rgba.set([90, 60, 40, 255], (y * W + x) * 4);
  return { width: W, height: H, rgba };
};

/** A rectangle's corners in the order a drawn key's quad is laid: top left, top right, bottom right, bottom left. */
const corners = (x0: number, y0: number, x1: number, y1: number): ReadonlyArray<Pt> => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

const HEAD = corners(39, 9, 60, 39);
const ARM = corners(69, 45, 90, 54);

/** A head on its head bone and an arm of two bones (upper and fore, the elbow at x 78), each on the root. */
const SKELETON: Skeleton = {
  bones: [
    { name: 'root', pivot: ROOT, tip: [51, 60] },
    { name: 'head', parent: 'root', pivot: [51, 39], tip: [51, 9] },
    { name: 'upper', parent: 'root', pivot: [69, 48], tip: [78, 48] },
    { name: 'fore', parent: 'upper', pivot: [78, 48], tip: [90, 48] },
  ],
  skin: { head: ['head'], arm: ['upper', 'fore'] },
};

const PUPPET = Result.getOrThrow(
  puppetOf(
    {
      width: W,
      height: H,
      parts: [
        { name: 'head', pixels: block(39, 9, 60, 39) },
        { name: 'arm', pixels: block(69, 45, 90, 54) },
      ],
    },
    SKELETON,
  ),
);

const drawing = (width: number, height: number): Raster => ({
  width,
  height,
  rgba: new Uint8Array(width * height * 4),
});

const loaded = (): LoadedPuppet => ({
  puppet: PUPPET,
  drawings: new Map([
    ['blink', drawing(21, 30)],
    ['fold', drawing(21, 9)],
  ]),
  paints: false,
  gl: puppetGl(PUPPET),
});

const SPEC: PuppetSpec = {
  key: 'test/two-parts',
  size: [W, H],
  parts: [],
  skeleton: SKELETON,
  origin: [0, 0],
};

const ctx = {
  getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
  canvas: { width: W, height: H },
} as unknown as CanvasRenderingContext2D;

const poseOf = (numbers: Readonly<Record<string, number>>): PuppetPose => ({
  numbers,
  root: ROOT,
  scale: 1,
});

/** A closed-eye head laid over the head, and an arm key laid over the arm. */
const BLINK = {
  part: 'head',
  drawing: 'blink',
  place: { s: 1, dx: 39, dy: 9 },
  pivot: [51, 24],
  theta: 0,
} as const;
const FOLD = {
  part: 'arm',
  drawing: 'fold',
  place: { s: 1, dx: 69, dy: 45 },
  pivot: [81, 48],
  theta: 0,
} as const;

/** The quad laid in place of part `k`: its four corners, canvas px. */
const keyQuad = (l: LoadedPuppet, k: number): ReadonlyArray<Pt> => {
  const q = l.gl.swapPositions[k];
  if (q === undefined) return [];
  return [0, 1, 2, 3].map((i): Pt => [q[2 * i]!, q[2 * i + 1]!]);
};

const near = (got: ReadonlyArray<Pt>, want: ReadonlyArray<Pt>) => {
  expect(got.length).toBe(want.length);
  for (const [i, [x, y]] of want.entries()) {
    expect(got[i]![0]).toBeCloseTo(x, 3);
    expect(got[i]![1]).toBeCloseTo(y, 3);
  }
};

describe('a look lays its drawn keys', () => {
  test('a key in place of each of two parts at once: a blink and an arm key', () => {
    const l = loaded();
    const look: PuppetLook = { boil: 0, swaps: [BLINK, FOLD] };
    expect(drawPuppet(ctx, SPEC, l, poseOf({}), look)).toBeUndefined();
    near(keyQuad(l, 0), HEAD);
    near(keyQuad(l, 1), ARM);
  });

  test('a key in place of a part the puppet lacks is why it cannot draw', () => {
    const look: PuppetLook = { boil: 0, swaps: [BLINK, { ...FOLD, part: 'tail' }] };
    expect(drawPuppet(ctx, SPEC, loaded(), poseOf({}), look)).toBe(
      'puppet test/two-parts: no part tail to lay a drawing in place of',
    );
  });

  test('two keys in place of one part are why it cannot draw', () => {
    const look: PuppetLook = { boil: 0, swaps: [FOLD, { ...BLINK, part: 'arm' }] };
    expect(drawPuppet(ctx, SPEC, loaded(), poseOf({}), look)).toBe(
      'puppet test/two-parts: two drawings laid in place of part arm',
    );
  });
});
