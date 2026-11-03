import { describe, expect, test } from 'bun:test';
import { Result } from 'effect';
import { type PuppetPose, type Skeleton, puppetOf } from '../core/puppet.ts';
import type { Raster } from '../core/raster.ts';
import type { Ramp } from './colour.ts';
import { dyeKnots, dyeUniforms } from './dye.ts';
import {
  type LoadedPuppet,
  type PuppetDress,
  type PuppetLook,
  type PuppetSpec,
  dressOf,
  drawPuppet,
} from './puppet.ts';
import { UNDRESSED, puppetGl } from './puppet-gl.ts';

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

/** A closed-eye head laid over the head, and an arm key laid over the arm, each pivoting on a vertex of its part's grid. */
const BLINK = {
  part: 'head',
  drawing: 'blink',
  place: { s: 1, dx: 39, dy: 9 },
  pivot: [51, 24],
} as const;
const FOLD = {
  part: 'arm',
  drawing: 'fold',
  place: { s: 1, dx: 69, dy: 45 },
  pivot: [81, 48],
} as const;

/** The quad laid in place of part `k`: its four corners, canvas px. */
const keyQuad = (l: LoadedPuppet, k: number): ReadonlyArray<Pt> => {
  const q = l.gl.swapPositions[k];
  if (q === undefined) return [];
  return [0, 1, 2, 3].map((i): Pt => [q[2 * i]!, q[2 * i + 1]!]);
};

/** Where part `k`'s vertex at sheet px `p` (a point of its mesh's grid) was last posed, canvas px. */
const partAt = (l: LoadedPuppet, k: number, [x, y]: Pt): Pt => {
  const v = PUPPET.parts[k]!.mesh.vertices;
  const i = v.findIndex(
    (_, j) => j % 2 === 0 && Math.abs(v[j]! - x) < 1e-9 && Math.abs(v[j + 1]! - y) < 1e-9,
  );
  expect(i).toBeGreaterThanOrEqual(0);
  const out = l.gl.positions[k]!;
  return [out[i]!, out[i + 1]!];
};

/** The point of a key's quad at `[u, v]`, fractions of its drawing's width and height. */
const inKey = (q: ReadonlyArray<Pt>, [u, v]: Pt): Pt => {
  const [tl, tr, br, bl] = q as readonly [Pt, Pt, Pt, Pt];
  const top: Pt = [tl[0] + u * (tr[0] - tl[0]), tl[1] + u * (tr[1] - tl[1])];
  const bottom: Pt = [bl[0] + u * (br[0] - bl[0]), bl[1] + u * (br[1] - bl[1])];
  return [top[0] + v * (bottom[0] - top[0]), top[1] + v * (bottom[1] - top[1])];
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

describe("a drawn key rides its part's bones at its pivot", () => {
  test('a head key turns with its head bone', () => {
    const l = loaded();
    const look: PuppetLook = { boil: 0, swaps: [BLINK] };
    expect(drawPuppet(ctx, SPEC, l, poseOf({ head: 20 }), look)).toBeUndefined();
    near(
      keyQuad(l, 0),
      HEAD.map((p) => partAt(l, 0, p)),
    );
  });

  test("a head key rides its head bone's parent too", () => {
    const l = loaded();
    const look: PuppetLook = { boil: 0, swaps: [BLINK] };
    expect(drawPuppet(ctx, SPEC, l, poseOf({ root: -6, head: 3 }), look)).toBeUndefined();
    near(
      keyQuad(l, 0),
      HEAD.map((p) => partAt(l, 0, p)),
    );
  });

  test("an arm key's pivot lands where the arm's own pixel does, in the elbow's blend", () => {
    const l = loaded();
    const look: PuppetLook = { boil: 0, swaps: [FOLD] };
    expect(drawPuppet(ctx, SPEC, l, poseOf({ fore: 40 }), look)).toBeUndefined();
    near([inKey(keyQuad(l, 1), [12 / 21, 3 / 9])], [partAt(l, 1, [81, 48])]);
  });

  test('a key that does not ride stays where its place lays it, whatever its bones do', () => {
    const l = loaded();
    const look: PuppetLook = { boil: 0, swaps: [{ ...FOLD, rides: false }] };
    expect(drawPuppet(ctx, SPEC, l, poseOf({ fore: 40 }), look)).toBeUndefined();
    near(keyQuad(l, 1), ARM);
  });

  test('theta turns a key further about its pivot', () => {
    const l = loaded();
    const look: PuppetLook = { boil: 0, swaps: [{ ...BLINK, pivot: [51, 39], theta: 10 }] };
    expect(drawPuppet(ctx, SPEC, l, poseOf({ head: 20 }), look)).toBeUndefined();
    const further = loaded();
    expect(drawPuppet(ctx, SPEC, further, poseOf({ head: 30 }))).toBeUndefined();
    near(
      keyQuad(l, 0),
      HEAD.map((p) => partAt(further, 0, p)),
    );
  });
});

/** The ramp the head is drawn in (L* rising from above the ink cut), and a cloth's ramp to dye it to. */
const DRAWN: Ramp = { shade: '#8a7f70', base: '#b8ab98', light: '#ddd2c0' };
const INDIGO: Ramp = { shade: '#394357', base: '#4b566b', light: '#6a7590' };

/** The two parts' sheet as a dress reads it: the head declares the ramp it is drawn in, the arm none. */
const DRESSED: PuppetSpec = {
  ...SPEC,
  parts: [
    { name: 'head', png: 'head.png', ramp: DRAWN },
    { name: 'arm', png: 'arm.png' },
  ],
};

/** Every buffer a draw writes, copied: each part's posed vertices, its rest place and its key's quad. */
const buffersOf = (l: LoadedPuppet) => ({
  positions: l.gl.positions.map((b) => Array.from(b)),
  rest: l.gl.restPositions.map((b) => Array.from(b)),
  swaps: l.gl.swapPositions.map((b) => Array.from(b)),
});

const drawn = (
  dress: PuppetDress | undefined,
  pose: PuppetPose,
  look?: PuppetLook,
): LoadedPuppet => {
  const l = loaded();
  expect(drawPuppet(ctx, DRESSED, l, pose, look, dress)).toBeUndefined();
  return l;
};

describe("a draw's dress", () => {
  test.each([
    [{ hide: ['tail'] }, 'the dress hides no part tail'],
    [{ dye: { tail: INDIGO } }, 'the dress dyes no part tail'],
    [{ dye: { arm: INDIGO } }, 'the dress dyes part arm, which declares no ramp it is drawn in'],
  ] satisfies ReadonlyArray<readonly [PuppetDress, string]>)('refuses %j: %s', (dress, why) => {
    expect(dressOf(DRESSED, PUPPET, dress)).toEqual(Result.fail(why));
    expect(drawPuppet(ctx, DRESSED, loaded(), poseOf({}), undefined, dress)).toBe(
      `puppet test/two-parts: ${why}`,
    );
  });

  test('refuses a dye its ramps cannot map, naming the part', () => {
    const backwards: Ramp = { shade: '#e0d0c0', base: '#a09080', light: '#605040' };
    const why = Result.match(dressOf(DRESSED, PUPPET, { dye: { head: backwards } }), {
      onFailure: (f) => f,
      onSuccess: () => 'worn',
    });
    expect(why).toStartWith("the dress dyes part head: the cloth's ramp");
  });

  test.each([undefined, {}, { hide: [], dye: {} }] satisfies ReadonlyArray<
    PuppetDress | undefined
  >)('%j asks nothing of the passes and lays what no dress lays', (dress) => {
    expect(Result.getOrThrow(dressOf(DRESSED, PUPPET, dress))).toBe(UNDRESSED);
    const pose = poseOf({ head: 12, fore: 40 });
    const look: PuppetLook = { boil: 0, swaps: [BLINK] };
    expect(buffersOf(drawn(dress, pose))).toEqual(buffersOf(drawn(undefined, pose)));
    expect(buffersOf(drawn(dress, pose, look))).toEqual(buffersOf(drawn(undefined, pose, look)));
  });

  test('a hidden part is neither posed nor laid at rest, and the parts it hides nothing of are laid as undressed', () => {
    const pose = poseOf({ head: 12, fore: 40 });
    const look: PuppetLook = { boil: 0, swaps: [] };
    const bare = buffersOf(drawn(undefined, pose, look));
    expect(bare.positions[1]!.some((v) => v !== 0)).toBe(true);
    expect(bare.rest[1]!.some((v) => v !== 0)).toBe(true);
    const hidden = drawn({ hide: ['arm'] }, pose, look);
    expect(Result.getOrThrow(dressOf(DRESSED, PUPPET, { hide: ['arm'] })).hidden).toEqual([1]);
    const got = buffersOf(hidden);
    expect(got.positions[1]!.every((v) => v === 0)).toBe(true);
    expect(got.rest[1]!.every((v) => v === 0)).toBe(true);
    expect(got.positions[0]).toEqual(bare.positions[0]!);
  });

  test("a dyed part is handed to the passes with its drawn ramp's knots onto the cloth's, and only it", () => {
    const worn = Result.getOrThrow(dressOf(DRESSED, PUPPET, { dye: { head: INDIGO } }));
    const knots = Result.getOrThrow(dyeKnots(DRAWN, INDIGO));
    expect([...worn.dyes.keys()]).toEqual([0]);
    expect(worn.hidden).toEqual([]);
    expect(dyeUniforms(worn.dyes.get(0)!)).toEqual(dyeUniforms(knots));
    const pose = poseOf({ head: 12 });
    expect(buffersOf(drawn({ dye: { head: INDIGO } }, pose))).toEqual(
      buffersOf(drawn(undefined, pose)),
    );
  });
});
