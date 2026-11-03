import { describe, expect, test } from 'bun:test';
import { Option, Predicate, Result, Schema } from 'effect';
import { labOf } from './cast-sheet-pixels.ts';
import {
  LimbRefused,
  type PuppetLimb,
  type PuppetPartLimb,
  limbBlend,
  limbOf,
  limbShares,
} from './limb.ts';
import { type Skeleton, boneTransforms, puppetOf, rasterOf } from './puppet.ts';

type Pt = readonly [number, number];
type Rgb = readonly [number, number, number];
type PuppetSheet = Parameters<typeof puppetOf>[0];
type Raster = PuppetSheet['parts'][number]['pixels'];

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];
const along = (p: Pt, d: Pt, l: number): Pt => [p[0] + l * d[0], p[1] + l * d[1]];
const unit = (a: Pt): Pt => [a[0] / Math.hypot(...a), a[1] / Math.hypot(...a)];
/** The side a positive elbow turn opens of a segment running along `d`, as the fixtures draw it. */
const opens = (d: Pt): Pt => [d[1], -d[0]];
/** `p`'s `(u, v)` on the line from `a` along `d`, u counted on from `from`. */
const frame = (p: Pt, a: Pt, d: Pt, from: number): Pt => [
  from + dot(sub(p, a), d),
  dot(sub(p, a), opens(d)),
];
const toSegmentSquared = (p: Pt, a: Pt, d: Pt, l: number) => {
  const x = p[0] - a[0],
    y = p[1] - a[1];
  const t = Math.max(0, Math.min(l, x * d[0] + y * d[1]));
  return (x - t * d[0]) ** 2 + (y - t * d[1]) ** 2;
};
const squareDistance = (a: Pt, b: Pt) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

/** Which sides a fixture inks: `[inner, outer]`. */
type Inked = readonly [boolean, boolean];
const BOTH: Inked = [true, true];
const NONE: Inked = [false, false];

const [W, H] = [200, 300];
const S: Pt = [60, 40];
const E: Pt = [90, 150];
const C: Pt = [117, 249];
const D = unit([30, 110]);
const OUTER = opens(D);
const UPPER = Math.hypot(30, 110);
const CUFF = UPPER + Math.hypot(27, 99);
const outerWidth = (u: number) => 26 - 0.03 * u;
const innerWidth = (u: number) => 20 - 0.02 * u;
const INK = [34, 15, 3] as const;
const LIGHT = [236, 214, 178] as const;
const DARK = [196, 170, 136] as const;
const SKIN = [240, 170, 120] as const;
const STUB = 14;
const HAND = along(C, D, 14);

/** The sleeve's colour at (u, v), or none off the sleeve. */
const sleeveAt = (u: number, v: number, inked: Inked): ReadonlyArray<Rgb> => {
  const w = Math.max(0, u);
  const sides: ReadonlyArray<readonly [number, Rgb]> = [
    [innerWidth(w), DARK],
    [outerWidth(w), LIGHT],
  ];
  const side = Number(v >= 0);
  const [half, plane] = sides[side]!;
  if (u < -STUB || u > CUFF || Math.abs(v) > half) return [];
  if (inked[side] && Math.abs(v) > half - 4) return [INK];
  return [plane];
};

const texelAt = (x: number, y: number, inked: Inked): ReadonlyArray<Rgb> => {
  const [u, v] = frame([x + 0.5, y + 0.5], S, D, 0);
  if (squareDistance([x + 0.5, y + 0.5], HAND) <= 14 ** 2 && u > CUFF) return [SKIN];
  return sleeveAt(u, v, inked);
};

const paint = (
  width: number,
  height: number,
  at: (x: number, y: number) => ReadonlyArray<Rgb>,
): Raster => {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      for (const c of at(x, y)) rgba.set([...c, 255], (y * width + x) * 4);
  return { width, height, rgba };
};

const armPixels = (inked: Inked) => paint(W, H, (x, y) => texelAt(x, y, inked));

/** `r` with each texel of a colour `pairs` names in its colour there. */
const recoloured = (r: Raster, pairs: ReadonlyArray<readonly [Rgb, Rgb]>): Raster => {
  const rgba = r.rgba.slice();
  for (let i = 0; i < rgba.length; i += 4)
    for (const [from, to] of pairs) if (from.every((c, j) => rgba[i + j] === c)) rgba.set(to, i);
  return { ...r, rgba };
};

const BONES: Skeleton['bones'] = [
  { name: 'shoulderRight', pivot: S, tip: E },
  { name: 'elbowRight', parent: 'shoulderRight', pivot: E, tip: C },
  { name: 'wristRight', parent: 'elbowRight', pivot: C, tip: along(C, D, 20) },
];
const CHAIN = ['shoulderRight', 'elbowRight', 'wristRight'] as const;
const DECLARED: PuppetLimb = { part: 'arm', bones: CHAIN };
const SKELETON: Skeleton = {
  bones: BONES,
  skin: { arm: [...CHAIN] },
  limbs: [DECLARED],
};
const ARM = armPixels(BOTH);
const SHEET: PuppetSheet = { width: W, height: H, parts: [{ name: 'arm', pixels: ARM }] };
const JOINTS = { shoulder: S, elbow: E, wrist: C };
/** Cloth as dark as ink (L* about 13) under a darker ink: no edge shows where its ink ends. */
const DARK_SLEEVE = recoloured(ARM, [
  [LIGHT, [40, 30, 30]],
  [DARK, [40, 30, 30]],
  [INK, [10, 5, 2]],
]);

const LIMB: PuppetPartLimb = Result.getOrThrow(limbOf('arm', ARM, JOINTS, DECLARED));

const kindOf = (r: ReturnType<typeof limbOf>) =>
  Result.match(r, { onSuccess: () => 'measured', onFailure: (e) => e.kind });

const [BW, BH] = [220, 200];
const BD1 = unit([20, 110]);
const BD2: Pt = [Math.SQRT1_2 * (-BD1[1] - BD1[0]), Math.SQRT1_2 * (BD1[0] - BD1[1])];
const [B_UPPER, B_FORE] = [120, 90];
const BS: Pt = [150, 30];
const BE = along(BS, BD1, B_UPPER);
const BC = along(BE, BD2, B_FORE);
const B_HAND = along(BC, BD2, 14);
const B_INNER = 18;
const bentOuter = (u: number) =>
  Math.max(26 - (23 * u) / B_UPPER, 3 + (17 * (u - B_UPPER)) / B_FORE);

const bentSleeve = (p: Pt): ReadonlyArray<Rgb> => {
  const cells = [
    [...frame(p, BS, BD1, 0), -STUB, B_UPPER],
    [...frame(p, BE, BD2, B_UPPER), B_UPPER, B_UPPER + B_FORE],
  ] as const;
  const fore = toSegmentSquared(p, BE, BD2, B_FORE) < toSegmentSquared(p, BS, BD1, B_UPPER);
  const [u, v, lo, hi] = cells[Number(fore)]!;
  const side = Number(v >= 0);
  const half = [B_INNER, bentOuter(u)][side]!;
  if (u < lo || u > hi || Math.abs(v) > half) return [];
  return [[[DARK, LIGHT][side]!, INK][Number(Math.abs(v) > half - 4)]!];
};

const bentTexel = (x: number, y: number): ReadonlyArray<Rgb> => {
  const p: Pt = [x + 0.5, y + 0.5];
  if (squareDistance(p, B_HAND) <= 14 ** 2 && frame(p, BE, BD2, 0)[0] > B_FORE) return [SKIN];
  if (squareDistance(p, BE) <= 3 ** 2) return [INK];
  return bentSleeve(p);
};

const BENT = paint(BW, BH, bentTexel);
const FOLD_SLOPE = Math.tan(Math.PI / 8);

const BENT_BONES: Skeleton['bones'] = [
  { name: CHAIN[0], pivot: BS, tip: BE },
  { name: CHAIN[1], parent: CHAIN[0], pivot: BE, tip: BC },
  { name: CHAIN[2], parent: CHAIN[1], pivot: BC, tip: B_HAND },
];
const BENT_PUPPET = Result.getOrThrow(
  puppetOf(
    { width: BW, height: BH, parts: [{ name: 'arm', pixels: BENT }] },
    { bones: BENT_BONES, skin: { arm: [...CHAIN] }, limbs: [DECLARED] },
  ),
);
const BENT_LIMB = Option.getOrThrow(Option.fromUndefinedOr(BENT_PUPPET.parts[0]!.limb));

const HALF = Result.getOrThrow(
  puppetOf(
    {
      width: W / 2,
      height: H / 2,
      parts: [{ name: 'arm', pixels: paint(W / 2, H / 2, (x, y) => texelAt(2 * x, 2 * y, BOTH)) }],
    },
    {
      bones: BONES.map((b) => ({
        ...b,
        pivot: [b.pivot[0] / 2, b.pivot[1] / 2] as const,
        tip: [b.tip[0] / 2, b.tip[1] / 2] as const,
      })),
      skin: { arm: [...CHAIN] },
      limbs: [DECLARED],
    },
  ),
);
const HALF_LIMB = Option.getOrThrow(Option.fromUndefinedOr(HALF.parts[0]!.limb));

/** Acceptance E's OKLab distance, distinct from the measurement's CIE Lab. */
const oklab = (rgb: Rgb): Rgb => {
  const linear = rgb.map((c) => {
    const v = c / 255;
    if (v <= 0.04045) return v / 12.92;
    return ((v + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = linear as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};

const bentFrames = new Map<string, Raster>();
const bentAt = (elbowRight: number, wristRight = 0) =>
  Option.getOrElse(Option.fromUndefinedOr(bentFrames.get(`${elbowRight}/${wristRight}`)), () => {
    const r = rasterOf(BENT_PUPPET, {
      numbers: { elbowRight, wristRight },
      root: BENT_PUPPET.root,
      scale: 1,
    });
    bentFrames.set(`${elbowRight}/${wristRight}`, r);
    return r;
  });

/** Brute-force distance to the raster's alpha boundary: independent of the stroke's distance transform. */
const nearBoundary = (r: Raster, x: number, y: number, width: number, alpha = 128) => {
  const radius = Math.ceil(width);
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > width * width) continue;
      if (r.rgba[((y + dy) * r.width + x + dx) * 4 + 3]! < alpha) return true;
    }
  return false;
};

/** The measured cut and the hand's own narrow alpha boundary receive ink; a bar deep inside the hand or across the sleeve has no exemption. */
const cuffCut: Array<Pt> = [];
const handEdge: Array<Pt> = [];
for (let y = Math.floor(B_HAND[1] - 18); y <= Math.ceil(B_HAND[1] + 18); y++)
  for (let x = Math.floor(B_HAND[0] - 18); x <= Math.ceil(B_HAND[0] + 18); x++) {
    if (BENT.rgba[(y * BW + x) * 4 + 3]! < 128) continue;
    const hand = limbShares(BENT_LIMB, x, y)[2];
    if (
      hand >= 0.5 &&
      [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ].some(([dx, dy]) => BENT.rgba[((y + dy!) * BW + x + dx!) * 4 + 3]! < 128)
    )
      handEdge.push([x + 0.5, y + 0.5]);
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ] as const) {
      if (BENT.rgba[((y + dy) * BW + x + dx) * 4 + 3]! < 128) continue;
      if (Math.abs(hand - limbShares(BENT_LIMB, x + dx, y + dy)[2]) < 0.5) continue;
      cuffCut.push([x + 0.5 + dx / 2, y + 0.5 + dy / 2]);
    }
  }

const strayInk = (r: Raster, elbow: number, width: number) => {
  const radius = Math.ceil(width + 1);
  const turn = (elbow * Math.PI) / 180;
  let stray = 0;
  for (let y = radius; y < r.height - radius; y++)
    for (let x = radius; x < r.width - radius; x++) {
      const i = (y * r.width + x) * 4;
      if (r.rgba[i + 3]! < 128 || r.rgba[i]! > 45) continue;
      if (nearBoundary(r, x, y, width + 1)) continue;
      const dx = x + 0.5 - BE[0],
        dy = y + 0.5 - BE[1];
      const q: Pt = [
        BE[0] + Math.cos(turn) * dx + Math.sin(turn) * dy,
        BE[1] - Math.sin(turn) * dx + Math.cos(turn) * dy,
      ];
      const [u, v] = frame(q, BE, BD2, B_UPPER);
      const cuff = cuffCut.some(
        (p) => (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 <= (width + Math.SQRT2) ** 2,
      );
      const handOutline = handEdge.some(
        (p) =>
          (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 <=
          (Math.min(width, Math.max(2, 0.045 * Math.sqrt(BENT_LIMB.regions.handArea))) +
            Math.SQRT2) **
            2,
      );
      const fold =
        elbow > 60 &&
        u >= B_UPPER &&
        u <= B_UPPER + B_FORE &&
        Math.abs(v - bentOuter(u)) <= width + 1;
      if (!fold && !cuff && !handOutline) stray++;
    }
  return stray;
};

const components = (r: Raster) => {
  const seen = new Uint8Array(r.width * r.height);
  const queue: Array<number> = [];
  let count = 0;
  for (let i = 0; i < seen.length; i++) {
    if (seen[i] || r.rgba[i * 4 + 3]! < 128) continue;
    count++;
    queue.length = 0;
    queue.push(i);
    seen[i] = 1;
    for (let q = 0; q < queue.length; q++) {
      const p = queue[q]!;
      for (const n of [p - r.width, p + r.width, p - 1, p + 1]) {
        if (n < 0 || n >= seen.length || seen[n] || r.rgba[n * 4 + 3]! < 128) continue;
        seen[n] = 1;
        queue.push(n);
      }
    }
  }
  return count;
};

const ghostInk = (r: Raster, width: number) => {
  let ghost = 0;
  for (let y = 1; y < r.height - 1; y++)
    for (let x = 1; x < r.width - 1; x++) {
      const i = (y * r.width + x) * 4;
      const a = r.rgba[i + 3]!;
      if (a <= 0 || a >= 250 || r.rgba[i]! > 45) continue;
      if (!nearBoundary(r, x, y, width, 1)) ghost++;
    }
  return ghost;
};

/** Directed pixel-cell boundaries, traced independently of the renderer's mask operations. */
const boundaryEdges = (r: Raster) => {
  const stride = r.width + 1;
  const edges = new Map<number, Array<number>>();
  const at = (x: number, y: number) =>
    x >= 0 && x < r.width && y >= 0 && y < r.height && r.rgba[(y * r.width + x) * 4 + 3]! >= 128;
  const edge = (x: number, y: number, dx: number, dy: number) => {
    const key = y * stride + x;
    const list = Option.getOrElse(Option.fromUndefinedOr(edges.get(key)), (): Array<number> => []);
    list.push((y + dy) * stride + x + dx);
    edges.set(key, list);
  };
  for (let y = 0; y < r.height; y++)
    for (let x = 0; x < r.width; x++) {
      if (!at(x, y)) continue;
      if (!at(x, y - 1)) edge(x, y, 1, 0);
      if (!at(x + 1, y)) edge(x + 1, y, 0, 1);
      if (!at(x, y + 1)) edge(x + 1, y + 1, -1, 0);
      if (!at(x - 1, y)) edge(x, y + 1, 0, -1);
    }
  return { edges, stride };
};

const contours = (r: Raster): Array<Array<Pt>> => {
  const { edges, stride } = boundaryEdges(r);
  const loops: Array<Array<Pt>> = [];
  while (edges.size > 0) {
    const first = Option.getOrThrow(Option.fromUndefinedOr([...edges.keys()][0]));
    const points: Array<Pt> = [];
    let p = first;
    do {
      points.push([p % stride, Math.floor(p / stride)]);
      const next = Option.getOrThrow(Option.fromUndefinedOr(edges.get(p)));
      const following = Option.getOrThrow(Option.fromUndefinedOr(next.pop()));
      if (next.length === 0) edges.delete(p);
      p = following;
    } while (p !== first);
    loops.push(points);
  }
  return loops;
};
const wristTurnBound = (
  r: Raster,
  centre: Pt,
  reach: number,
  ink: number,
  kind: 'both' | 'convex' | 'concave' = 'both',
) => {
  const step = Math.ceil(ink);
  let worst = 0;
  let checked = 0;
  for (const points of contours(r)) {
    const n = points.length;
    if (n <= 2 * step) continue;
    for (let i = 0; i < n; i++) {
      const p = points[i]!;
      if (Math.hypot(...sub(p, centre)) > reach) continue;
      checked++;
      const a = sub(p, points[(i - step + n) % n]!),
        b = sub(points[(i + step) % n]!, p);
      const length = Math.hypot(...a) * Math.hypot(...b);
      if (length === 0) continue;
      const cross = a[0] * b[1] - a[1] * b[0];
      if ((kind === 'convex' && cross < 0) || (kind === 'concave' && cross >= 0)) continue;
      worst = Math.max(worst, Math.acos(Math.max(-1, Math.min(1, dot(a, b) / length))));
    }
  }
  expect(checked).toBeGreaterThan(0);
  return worst;
};

const bareWristCloth = (r: Raster, centre: Pt, reach: number) => {
  let bare = 0;
  for (let y = 1; y < r.height - 1; y++)
    for (let x = 1; x < r.width - 1; x++) {
      if (Math.hypot(x + 0.5 - centre[0], y + 0.5 - centre[1]) > reach) continue;
      const i = (y * r.width + x) * 4;
      if (r.rgba[i + 3]! < 128 || r.rgba[i]! < 90) continue;
      const c: Pt = [r.rgba[i + 1]!, r.rgba[i + 2]!];
      if (
        Math.hypot(c[0] - SKIN[1], c[1] - SKIN[2]) <
        Math.min(
          Math.hypot(c[0] - LIGHT[1], c[1] - LIGHT[2]),
          Math.hypot(c[0] - DARK[1], c[1] - DARK[2]),
        )
      )
        continue;
      if (nearBoundary(r, x, y, 1)) bare++;
    }
  return bare;
};

const silhouetteIoU = (before: Raster, after: Raster) => {
  let inter = 0,
    union = 0;
  for (let i = 3; i < before.rgba.length; i += 4) {
    const a = before.rgba[i]! >= 128,
      b = after.rgba[i]! >= 128;
    if (a || b) union++;
    if (a && b) inter++;
  }
  return inter / union;
};

/** Skin outside the posed hand, restricted to forearm-frame hand texels (the ghost-wrist oracle). */
const ghostSkin = (
  half: Parameters<typeof rasterOf>[0],
  numbers: Readonly<Record<string, number>>,
  r: Raster,
) => {
  const part = half.parts[0]!;
  const limb = Option.getOrThrow(Option.fromUndefinedOr(part.limb));
  const alpha = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= half.width || y >= half.height) return 0;
    return part.pixels.rgba[(y * half.width + x) * 4 + 3]! / 255;
  };
  const m = boneTransforms(half.bones, numbers);
  const rest = (bone: number, x: number, y: number): Pt => {
    const i = 6 * bone,
      dx = x - m[i + 4]!,
      dy = y - m[i + 5]!;
    return [m[i]! * dx + m[i + 1]! * dy, m[i + 2]! * dx + m[i + 3]! * dy];
  };
  let skin = 0;
  for (let y = 0; y < r.height; y++)
    for (let x = 0; x < r.width; x++) {
      const i = (y * r.width + x) * 4;
      if (r.rgba[i + 3]! < 128 || r.rgba[i]! < 90) continue;
      const [hx, hy] = rest(2, x + 0.5, y + 0.5);
      const bx = Math.floor(hx - 0.5),
        by = Math.floor(hy - 0.5);
      const fx = hx - 0.5 - bx,
        fy = hy - 0.5 - by;
      let hand = 0;
      for (let k = 0; k < 4; k++) {
        const dx = k & 1,
          dy = k >> 1;
        hand +=
          [1 - fx, fx][dx]! *
          [1 - fy, fy][dy]! *
          limbShares(limb, bx + dx, by + dy)[2] *
          alpha(bx + dx, by + dy);
      }
      if (hand >= 0.5) continue;
      const [sx, sy] = rest(1, x + 0.5, y + 0.5);
      if (
        alpha(Math.floor(sx), Math.floor(sy)) < 0.5 ||
        limbShares(limb, Math.floor(sx), Math.floor(sy))[2] < 0.5
      )
        continue;
      const lab = labOf([r.rgba[i]!, r.rgba[i + 1]!, r.rgba[i + 2]!]);
      const distance = (c: Rgb) => {
        const of = labOf(c);
        return Math.hypot(lab[1] - of[1], lab[2] - of[2]);
      };
      if (distance(SKIN) < Math.min(distance(LIGHT), distance(DARK))) skin++;
    }
  return skin;
};

describe('rasterOf stroke silhouette', () => {
  test('a shoulder cut stays cloth where the body continues behind it', () => {
    const background = Result.getOrThrow(
      puppetOf(
        {
          width: W / 2,
          height: H / 2,
          parts: [
            {
              name: 'body',
              pixels: paint(W / 2, H / 2, (x, y) => {
                if (x >= 5 && x <= 85 && y >= 4 && y <= 70) return [LIGHT];
                return [];
              }),
            },
          ],
        },
        { bones: HALF.bones, skin: { body: [] } },
      ),
    );
    const puppet = { ...HALF, parts: [...HALF.parts, ...background.parts] };
    const p = along(S, D, -12);
    const i = (Math.floor(p[1] / 2) * (W / 2) + Math.floor(p[0] / 2)) * 4;
    for (const elbowRight of [25]) {
      const r = rasterOf(puppet, { numbers: { elbowRight }, root: puppet.root, scale: 1 }, [
        W / 2,
        40,
      ]);
      expect(r.rgba[i + 3]).toBe(255);
      expect(r.rgba[i]!).toBeGreaterThan(150);
    }
  });
  test('the painted arm is byte-identical through 15 to 19.5 degrees before the fade midpoint', () => {
    const painted = {
      ...HALF,
      parts: HALF.parts.map(({ limb: _limb, ...part }) => part),
    };
    for (const elbowRight of [15, 16, 17, 18, 19, 19.5]) {
      const pose = {
        numbers: { elbowRight, wristRight: -0.85 * elbowRight },
        root: painted.root,
        scale: 1,
      };
      expect(
        Buffer.compare(
          Buffer.from(rasterOf(HALF, pose).rgba),
          Buffer.from(rasterOf(painted, pose).rgba),
        ),
      ).toBe(0);
    }
  });
  test('the stub keeps painted coverage but its interior source ink becomes cloth in the single silhouette', () => {
    const pixels = paint(W / 2, H / 2, (x, y) => {
      const [u] = frame([2 * x + 0.5, 2 * y + 0.5], S, D, 0);
      if (u > -8 && u < -4 && ARM.rgba[(2 * y * W + 2 * x) * 4 + 3]! > 0) return [INK];
      return texelAt(2 * x, 2 * y, BOTH);
    });
    const puppet = Result.getOrThrow(
      puppetOf(
        { width: W / 2, height: H / 2, parts: [{ name: 'arm', pixels }] },
        { bones: HALF.bones, skin: { arm: [...CHAIN] }, limbs: [DECLARED] },
      ),
    );
    const p = along(along(S, D, -6), OUTER, -8);
    const i = (Math.floor(p[1] / 2) * (W / 2) + Math.floor(p[0] / 2)) * 4;
    const painted = rasterOf(puppet, { numbers: {}, root: puppet.root, scale: 1 });
    expect([...painted.rgba.subarray(i, i + 4)]).toEqual([...INK, 255]);
    for (const elbowRight of [25, 45, 90]) {
      const r = rasterOf(puppet, { numbers: { elbowRight }, root: puppet.root, scale: 1 });
      expect(r.rgba[i + 3]).toBe(255);
      expect(r.rgba[i]!).toBeGreaterThan(150);
    }
  });
  test('fixture D: no extra bare cloth near elbow or wrist at 0, 20, 45 and 90 degrees', () => {
    const bare = (r: Raster, elbow: number) => {
      const theta = (elbow * Math.PI) / 180;
      const d = sub(BC, BE);
      const wrist: Pt = [
        BE[0] + Math.cos(theta) * d[0] - Math.sin(theta) * d[1],
        BE[1] + Math.sin(theta) * d[0] + Math.cos(theta) * d[1],
      ];
      let count = 0;
      for (let y = 1; y < r.height - 1; y++)
        for (let x = 1; x < r.width - 1; x++) {
          if (
            (x - BE[0]) ** 2 + (y - BE[1]) ** 2 > (0.6 * B_FORE) ** 2 &&
            (x - wrist[0]) ** 2 + (y - wrist[1]) ** 2 > (0.35 * B_FORE) ** 2
          )
            continue;
          const i = (y * r.width + x) * 4;
          if (
            r.rgba[i + 3]! < 128 ||
            0.2126 * r.rgba[i]! + 0.7152 * r.rgba[i + 1]! + 0.0722 * r.rgba[i + 2]! < 90
          )
            continue;
          if ([i - 4, i + 4, i - 4 * r.width, i + 4 * r.width].some((j) => r.rgba[j + 3]! < 128))
            count++;
        }
      return count;
    };
    const rest = bare(bentAt(0), 0);
    for (const elbow of [0, 20, 45, 90])
      expect(bare(bentAt(elbow, -0.85 * elbow), elbow) - rest).toBeLessThanOrEqual(12);
  });
  test('fixture E: the forced stroke at rest matches its painted silhouette and cloth', () => {
    const puppet = HALF;
    const pose = { numbers: {}, root: puppet.root, scale: 1 };
    const painted = rasterOf(puppet, pose);
    const forced = {
      ...puppet,
      parts: puppet.parts.map((p) => ({ ...p, limb: { ...HALF_LIMB, fade: [-2, -1] as const } })),
    };
    const stroke = rasterOf(forced, pose);
    expect(silhouetteIoU(painted, stroke)).toBeGreaterThanOrEqual(0.97);
    let total = 0,
      checked = 0;
    for (let i = 0; i < painted.rgba.length; i += 4) {
      if (painted.rgba[i + 3]! < 128 || stroke.rgba[i + 3]! < 128 || painted.rgba[i]! < 90)
        continue;
      const a = oklab([painted.rgba[i]!, painted.rgba[i + 1]!, painted.rgba[i + 2]!]);
      const b = oklab([stroke.rgba[i]!, stroke.rgba[i + 1]!, stroke.rgba[i + 2]!]);
      total += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      checked++;
    }
    expect(checked).toBeGreaterThan(500);
    expect(total / checked).toBeLessThanOrEqual(0.035);
  });
  test('generated elbow and wrist turns leave zero skin outside the posed hand', () => {
    const half = Result.getOrThrow(
      puppetOf(
        {
          width: BW / 2,
          height: BH / 2,
          parts: [
            { name: 'arm', pixels: paint(BW / 2, BH / 2, (x, y) => bentTexel(2 * x, 2 * y)) },
          ],
        },
        {
          bones: BENT_BONES.map((b) => ({
            ...b,
            pivot: [b.pivot[0] / 2, b.pivot[1] / 2] as const,
            tip: [b.tip[0] / 2, b.tip[1] / 2] as const,
          })),
          skin: { arm: [...CHAIN] },
          limbs: [DECLARED],
        },
      ),
    );
    const rng = lcg(716);
    const poses: Array<readonly [number, number]> = [
      [25, -120],
      [25, 120],
      [60, -51],
      [90, 76.5],
      [120, 0],
      [120, -102],
    ];
    for (let i = 0; i < 10; i++) poses.push([25 + 95 * rng(), -120 + 240 * rng()]);
    const failures: Array<string> = [];
    for (const [elbowRight, wristRight] of poses) {
      const numbers = { elbowRight, wristRight };
      const r = rasterOf(half, { numbers, root: half.root, scale: 1 });
      const skin = ghostSkin(half, numbers, r);
      if (skin > 0) failures.push(`${elbowRight}/${wristRight}: ${skin}`);
    }
    expect(failures).toEqual([]);
  });
  test('the measured ink width doubles with the figure, rather than staying in output pixels', () => {
    const small = {
      ...HALF,
      parts: HALF.parts.map((part) => ({
        ...part,
        limb: { ...HALF_LIMB, fade: [-2, -1] as const },
      })),
    };
    const widths = [1, 2].map((scale) => {
      const r = rasterOf(
        small,
        { numbers: {}, root: [small.root[0] * scale, small.root[1] * scale], scale },
        [small.width * scale, small.height * scale],
      );
      const p = along(S, D, UPPER / 2);
      let depth = 0;
      for (let v = 0; v < 20 * scale; v += 0.25) {
        const x = Math.floor((p[0] / 2) * scale + OUTER[0] * v),
          y = Math.floor((p[1] / 2) * scale + OUTER[1] * v);
        const i = (y * r.width + x) * 4;
        if (r.rgba[i + 3]! >= 128 && r.rgba[i]! < 50) depth += 0.25;
      }
      return depth;
    });
    expect(widths[1]!).toBeGreaterThan(1.5 * widths[0]!);
    expect(Math.abs(widths[1]! - 2 * widths[0]!)).toBeLessThanOrEqual(1);
  });
  test('the whole limb turns no more sharply than its painted outline at rest', () => {
    const without = {
      ...BENT_PUPPET,
      parts: BENT_PUPPET.parts.map(({ limb: _limb, ...part }) => part),
    };
    const painted = rasterOf(without, { numbers: {}, root: BENT_PUPPET.root, scale: 1 });
    const bound = {
      convex: wristTurnBound(painted, [0, 0], BW + BH, BENT_LIMB.inkWidth, 'convex'),
      concave: wristTurnBound(painted, [0, 0], BW + BH, BENT_LIMB.inkWidth, 'concave'),
    };
    const turns = [20, 23, 35, 45, 60, 90].map((elbowRight) => {
      const r = bentAt(elbowRight, -0.85 * elbowRight);
      return {
        convex: wristTurnBound(r, [0, 0], BW + BH, BENT_LIMB.inkWidth, 'convex'),
        concave: wristTurnBound(r, [0, 0], BW + BH, BENT_LIMB.inkWidth, 'concave'),
      };
    });
    expect(Math.max(...turns.map((t) => t.convex))).toBeLessThanOrEqual(bound.convex);
    expect(Math.max(...turns.map((t) => t.concave))).toBeLessThanOrEqual(bound.concave);
  });

  test('painted 19.9 degrees and stroke 20 degrees share at least 97 percent of the arm silhouette', () => {
    const without = {
      ...BENT_PUPPET,
      parts: BENT_PUPPET.parts.map(({ limb: _limb, ...part }) => part),
    };
    const before = rasterOf(without, {
      numbers: { elbowRight: 19.9, wristRight: -0.85 * 19.9 },
      root: BENT_PUPPET.root,
      scale: 1,
    });
    const after = bentAt(20, -17);
    expect(silhouetteIoU(before, after)).toBeGreaterThanOrEqual(0.97);
  });
  test('the single-silhouette transition also ends without a pop at 25 degrees', () => {
    expect(
      silhouetteIoU(bentAt(24.9, -0.85 * 24.9), bentAt(25, -0.85 * 25)),
    ).toBeGreaterThanOrEqual(0.97);
  });
  test('the turned wrist has no bare cloth edge and no corner sharper than a quarter turn over one ink width', () => {
    for (const elbowRight of [45, 60, 90]) {
      const angle = (elbowRight * Math.PI) / 180,
        d = sub(BC, BE);
      const centre: Pt = [
        BE[0] + Math.cos(angle) * d[0] - Math.sin(angle) * d[1],
        BE[1] + Math.sin(angle) * d[0] + Math.cos(angle) * d[1],
      ];
      const reach =
        Math.max(BENT_LIMB.stations.cuff.inner, BENT_LIMB.stations.cuff.outer) + BENT_LIMB.inkWidth;
      const r = bentAt(elbowRight, -0.85 * elbowRight);
      expect(bareWristCloth(r, centre, reach)).toBe(0);
      expect(wristTurnBound(r, centre, reach, BENT_LIMB.inkWidth)).toBeLessThanOrEqual(Math.PI / 2);
    }
  });
  test('17, 20 and 23 degrees have one connected silhouette and no translucent interior ink', () => {
    for (const elbowRight of [17, 20, 23]) {
      const r = bentAt(elbowRight, -0.85 * elbowRight);
      expect(ghostInk(r, BENT_LIMB.inkWidth)).toBe(0);
      expect(components(r)).toBe(1);
    }
  });
  test('at 45 degrees ink stays on the single outline or cuff opening', () => {
    const r = bentAt(45);
    expect(strayInk(r, 45, BENT_LIMB.inkWidth)).toBe(0);
  });

  test('at 90 degrees ink stays on the union boundary, cuff opening or measured outer fold', () => {
    const r = bentAt(90);
    expect(strayInk(r, 90, BENT_LIMB.inkWidth)).toBe(0);
  });

  test('a hand turned back over its sleeve stays skin, opaque, above the sleeve', () => {
    const elbow = Math.PI / 4;
    const r = rasterOf(BENT_PUPPET, {
      numbers: { elbowRight: 45, wristRight: 180 },
      root: BENT_PUPPET.root,
      scale: 1,
    });
    const q = along(BC, BD2, -14);
    const dx = q[0] - BE[0],
      dy = q[1] - BE[1];
    const x = Math.floor(BE[0] + Math.cos(elbow) * dx - Math.sin(elbow) * dy);
    const y = Math.floor(BE[1] + Math.sin(elbow) * dx + Math.cos(elbow) * dy);
    expect([...r.rgba.subarray((y * BW + x) * 4, (y * BW + x) * 4 + 4)]).toEqual([...SKIN, 255]);
  });

  test('past the full fade no painted pixel survives at partial alpha', () => {
    const forced = {
      ...BENT_PUPPET,
      parts: BENT_PUPPET.parts.map((part) => ({
        ...part,
        limb: { ...BENT_LIMB, fade: [-2, -1] as const },
      })),
    };
    for (const elbowRight of [25, 90]) {
      const wristRight = -0.85 * elbowRight;
      const pose = { numbers: { elbowRight, wristRight }, root: BENT_PUPPET.root, scale: 1 };
      expect(
        Buffer.compare(
          Buffer.from(bentAt(elbowRight, wristRight).rgba),
          Buffer.from(rasterOf(forced, pose).rgba),
        ),
      ).toBe(0);
    }
  });
});

/** Where the bent limb's widths stray more than 1 px from the drawing, or a side ends on what the drawing does not. */
const bentFaults = (limb: PuppetPartLimb) => {
  const faults: Array<string> = [];
  for (let k = 0; k < limb.outer.widths.length; k++) {
    const u = (k + 0.5) * limb.step;
    const a = Math.abs(u - B_UPPER);
    const [outer, inner] = [limb.outer.widths[k]!, limb.inner.widths[k]!];
    if (Math.abs(outer - bentOuter(u)) > 1) faults.push(`outer ${outer} at ${u}`);
    if (a < 40 && Math.abs(inner - a * FOLD_SLOPE) > 1) faults.push(`fold ${inner} at ${u}`);
    if (a < 40 && (limb.inner.ends[k] !== 'fold' || limb.inner.inks[k] !== 0))
      faults.push(`fold end ${limb.inner.ends[k]} ink ${limb.inner.inks[k]} at ${u}`);
    if (a > 47 && (Math.abs(inner - B_INNER) > 1 || limb.inner.ends[k] !== 'ink'))
      faults.push(`inner ${inner} ${limb.inner.ends[k]} at ${u}`);
  }
  return faults;
};

describe('limbOf', () => {
  test('a positive elbow turn swings the forearm away from the side the fixture calls outer', () => {
    const m = boneTransforms(BONES, { elbowRight: 30 });
    const moved: Pt = [m[6]! * C[0] + m[8]! * C[1] + m[10]!, m[7]! * C[0] + m[9]! * C[1] + m[11]!];
    expect(dot(sub(moved, C), OUTER)).toBeLessThan(-10);
  });

  test("recovers each side's drawn half-width within 1 px along the sleeve", () => {
    const worst = { outer: 0, inner: 0 };
    for (let k = 0; k < LIMB.outer.widths.length; k++) {
      const u = (k + 0.5) * LIMB.step;
      worst.outer = Math.max(worst.outer, Math.abs(LIMB.outer.widths[k]! - outerWidth(u)));
      worst.inner = Math.max(worst.inner, Math.abs(LIMB.inner.widths[k]! - innerWidth(u)));
    }
    expect(worst.outer).toBeLessThanOrEqual(1);
    expect(worst.inner).toBeLessThanOrEqual(1);
    expect(LIMB.chain.upper).toBeCloseTo(UPPER, 9);
    expect(LIMB.step).toBeLessThanOrEqual(2);
  });

  test('reads the ink: its colour, its width, and its depth at each knot of both sides', () => {
    expect(LIMB.ink).toEqual([...INK]);
    expect(Math.abs(LIMB.inkWidth - 4)).toBeLessThanOrEqual(1);
    for (const side of [LIMB.outer, LIMB.inner]) {
      for (const d of side.inks) expect(Math.abs(d - 4)).toBeLessThanOrEqual(1);
      expect(new Set(side.ends)).toEqual(new Set(['ink']));
    }
  });

  test('marks a side cut against the body bare: its edge read, no ink taken from it', () => {
    const cut = Result.getOrThrow(limbOf('arm', armPixels([true, false]), JOINTS, DECLARED));
    expect(new Set(cut.outer.ends)).toEqual(new Set(['bare']));
    expect(cut.outer.inks.every((d) => d === 0)).toBe(true);
    expect(new Set(cut.inner.ends)).toEqual(new Set(['ink']));
    expect(Math.abs(cut.inkWidth - 4)).toBeLessThanOrEqual(1);
  });

  test('puts every texel in the stub, the sleeve or the hand, the shares summing to one', () => {
    const [bx, by, bw, bh] = LIMB.regions.box;
    let worst = 0;
    for (let y = by; y < by + bh; y++)
      for (let x = bx; x < bx + bw; x++) {
        const [stub, sleeve, hand] = limbShares(LIMB, x, y);
        worst = Math.max(worst, Math.abs(stub + sleeve + hand - 1), -Math.min(stub, sleeve, hand));
      }
    expect(worst).toBeLessThan(1e-12);
    const at = (u: number): Pt => [Math.floor(S[0] + u * D[0]), Math.floor(S[1] + u * D[1])];
    expect(limbShares(LIMB, ...at(-8))).toEqual([1, 0, 0]);
    expect(limbShares(LIMB, ...at(UPPER / 2))).toEqual([0, 1, 0]);
    expect(limbShares(LIMB, Math.floor(HAND[0]), Math.floor(HAND[1]))).toEqual([0, 0, 1]);
  });

  test('keeps the lining with the sleeve to the first skin pixel, with no half-owned hand texels', () => {
    const lined = paint(W, H, (x, y) => {
      const [u] = frame([x + 0.5, y + 0.5], S, D, 0);
      if (u > CUFF && u < CUFF + 8 && ARM.rgba[(y * W + x) * 4 + 3]! > 0) return [DARK];
      return texelAt(x, y, BOTH);
    });
    const limb = Result.getOrThrow(limbOf('arm', lined, JOINTS, DECLARED));
    const lining = along(C, D, 4),
      skin = along(C, D, 12);
    expect(limbShares(limb, Math.floor(lining[0]), Math.floor(lining[1]))).toEqual([0, 1, 0]);
    expect(limbShares(limb, Math.floor(skin[0]), Math.floor(skin[1]))).toEqual([0, 0, 1]);
    const [bx, by, bw, bh] = limb.regions.box;
    let partial = 0;
    for (let y = by; y < by + bh; y++)
      for (let x = bx; x < bx + bw; x++) {
        const hand = limbShares(limb, x, y)[2];
        if (hand > 0 && hand < 1) partial++;
      }
    expect(partial).toBe(0);
  });

  test('an isolated skin-coloured brush fleck in the lining cannot pull a tooth into the hand cut', () => {
    const lined = paint(W, H, (x, y) => {
      const [u] = frame([x + 0.5, y + 0.5], S, D, 0);
      if (u > CUFF && u < CUFF + 8 && ARM.rgba[(y * W + x) * 4 + 3]! > 0) {
        if (u > CUFF + 2 && u < CUFF + 3) return [SKIN];
        return [DARK];
      }
      return texelAt(x, y, BOTH);
    });
    const limb = Result.getOrThrow(limbOf('arm', lined, JOINTS, DECLARED));
    const p = along(along(C, D, 5), OUTER, 3);
    expect(limbShares(limb, Math.floor(p[0]), Math.floor(p[1]))[2]).toBe(0);
    const skin = along(along(C, D, 12), OUTER, 3);
    expect(limbShares(limb, Math.floor(skin[0]), Math.floor(skin[1]))[2]).toBe(1);
  });

  test('refuses an arm it cannot measure, naming the kind', () => {
    expect(kindOf(limbOf('arm', ARM, { ...JOINTS, wrist: [E[0] + 1, E[1] + 2] }, DECLARED))).toBe(
      'short-chain',
    );
    const away = (p: Pt): Pt => [p[0] + 100, p[1]];
    expect(
      kindOf(limbOf('arm', ARM, { shoulder: away(S), elbow: away(E), wrist: away(C) }, DECLARED)),
    ).toBe('off-part');
    const full = { width: W, height: H, rgba: new Uint8Array(W * H * 4).fill(255) };
    expect(kindOf(limbOf('arm', full, JOINTS, DECLARED))).toBe('open-edge');
    expect(kindOf(limbOf('arm', armPixels(NONE), JOINTS, DECLARED))).toBe('no-ink');
  });

  test('refuses a sleeve as dark as its ink, rather than measuring the whole half-width as ink', () => {
    const r = limbOf('arm', DARK_SLEEVE, JOINTS, DECLARED);
    expect(kindOf(r)).toBe('ink-unbounded');
    expect(Result.isFailure(r) && r.failure.detail).toMatch(/0 end on cloth/);
  });

  test('refuses one side as dark as its ink though the other side ends every dark run on cloth', () => {
    const r = limbOf('arm', recoloured(ARM, [[LIGHT, [40, 30, 30]]]), JOINTS, DECLARED);
    expect(kindOf(r)).toBe('ink-unbounded');
    expect(Result.isFailure(r) && r.failure.detail).toMatch(/^on its outer side /);
  });

  test('refuses a nearly straight-back forearm even when its paint has an inner crease', () => {
    const pixels = paint(200, 200, (x, y) => {
      if (x < 85 || x > 115 || y < 20 || y > 170 || (x === 101 && y === 100)) return [];
      if (x < 89 || x > 111 || y < 24 || y > 166) return [INK];
      return [LIGHT];
    });
    const r = limbOf(
      'arm',
      pixels,
      {
        shoulder: [100.5, 40.5],
        elbow: [100.500001, 150.5],
        wrist: [100.49998, 80.5],
      },
      DECLARED,
    );
    expect(kindOf(r)).toBe('no-station');
    expect(Result.isFailure(r) && r.failure.detail).toBe(
      'its forearm folds straight back over its upper arm, so its elbow has no outer side',
    );
  });

  test('refuses a cuff that is not a finite point under its own kind, never throwing', () => {
    for (const cuff of [
      [Number.POSITIVE_INFINITY, 1],
      [Number.NaN, 1],
    ] as const) {
      const r = limbOf('arm', ARM, JOINTS, { ...DECLARED, cuff });
      expect(kindOf(r)).toBe('non-finite');
      expect(Result.isFailure(r) && r.failure.detail).toBe(
        `its cuff (${cuff[0]}, 1) is not a finite point`,
      );
    }
  });
});

describe('limbOf on a bent chain', () => {
  test('cloth-coloured paint owned by the hand never becomes sleeve donor cloth', () => {
    const hx = Math.floor(B_HAND[0] / 2),
      hy = Math.floor(B_HAND[1] / 2);
    const half = (p: Pt): Pt => [p[0] / 2, p[1] / 2];
    const pixels = paint(BW / 2, BH / 2, (x, y) => {
      if (x >= hx + 2 && x <= hx + 3 && y >= hy && y <= hy + 1) return [LIGHT];
      return bentTexel(2 * x, 2 * y);
    });
    const limb = Result.getOrThrow(
      limbOf('arm', pixels, { shoulder: half(BS), elbow: half(BE), wrist: half(BC) }, DECLARED),
    );
    const x = hx + 2,
      y = hy + 1;
    expect(limbShares(limb, x, y)[2]).toBe(1);
    const [bx, by, width] = limb.regions.box;
    expect(limb.regions.cloth.getUint8((y - by) * width + x - bx)).toBe(0);
  });
  test('an asymmetric painted crease gives distinct upper and forearm inner stations', () => {
    const half = (p: Pt): Pt => [p[0] / 2, p[1] / 2];
    const notch = along(along(BE, BD1, -25), opens(BD1), -6);
    const pixels = paint(BW / 2, BH / 2, (x, y) => {
      if (Math.hypot(2 * x + 0.5 - notch[0], 2 * y + 0.5 - notch[1]) < 3) return [];
      return bentTexel(2 * x, 2 * y);
    });
    const limb = Result.getOrThrow(
      limbOf('arm', pixels, { shoulder: half(BS), elbow: half(BE), wrist: half(BC) }, DECLARED),
    );
    expect(2 * limb.stations.elbowUpper.inner).toBeLessThan(8);
    expect(2 * limb.stations.elbowFore.inner).toBeGreaterThan(9);
    expect(limb.stations.elbowFore.inner - limb.stations.elbowUpper.inner).toBeGreaterThan(1.5);
  });
  test('reads its stations from the drawing: the shoulder, the elbow on each segment, the cuff', () => {
    const s = BENT_LIMB.stations;
    const near = (got: number, want: number) => expect(Math.abs(got - want)).toBeLessThanOrEqual(1);
    near(s.shoulder.outer, bentOuter(s.shoulder.u));
    near(s.shoulder.inner, B_INNER);
    near(s.elbowUpper.outer, 3);
    near(s.elbowUpper.inner, B_INNER);
    near(s.elbowFore.inner, B_INNER);
    near(s.cuff.outer, bentOuter(s.cuff.u));
    near(s.cuff.inner, B_INNER);
    const crease = Math.hypot(...sub(s.crease, BE));
    near(crease, B_INNER / Math.sin(Math.PI / 8));
  });

  test("each side follows the drawing: the outer edge on both segments, the inner side stopping on the fold's bisector", () => {
    expect(BENT_LIMB.chain.upper).toBeCloseTo(B_UPPER, 9);
    expect(BENT_LIMB.chain.fore).toBeCloseTo(B_FORE, 9);
    expect(bentFaults(BENT_LIMB)).toEqual([]);
  });

  test('the elbow pivot in the outline ink: those knots unbounded, their ink unread, the ink width the drawn 4 px', () => {
    const { outer, step } = BENT_LIMB;
    const near = (k: number) => Math.abs((k + 0.5) * step - B_UPPER) < 8;
    const unbounded = outer.ends.flatMap((e, k) => [k].filter(() => e === 'unbounded'));
    expect(unbounded.length).toBeGreaterThan(0);
    expect(unbounded.filter((k) => !near(k))).toEqual([]);
    expect(unbounded.map((k) => outer.inks[k])).toEqual(unbounded.map(() => 0));
    expect(outer.ends.filter((e, k) => !near(k) && e !== 'ink')).toEqual([]);
    expect(BENT_LIMB.ink).toEqual([...INK]);
    expect(Math.abs(BENT_LIMB.inkWidth - 4)).toBeLessThanOrEqual(1);
  });

  test("a texel past the fold's bisector unrolls by the forearm: the hand, the forearm's sleeve, the stub", () => {
    const at = (p: Pt) => limbShares(BENT_LIMB, Math.floor(p[0]), Math.floor(p[1]));
    expect(at(B_HAND)).toEqual([0, 0, 1]);
    expect(at(along(BE, BD2, B_FORE / 2))).toEqual([0, 1, 0]);
    expect(at(along(BS, BD1, -8))).toEqual([1, 0, 0]);
  });
});

const lcg = (start: number) => {
  let seed = start;
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
};

/** What a blend at turn `t` (wrapped to `w`) gets wrong: a weight outside [0, 1] or a ramp end not exact. */
const endFaults = (t: number, w: number, a: { sleeve: number; fold: number }) => {
  const [f0, f1] = LIMB.fade;
  const [g0, g1] = LIMB.fold;
  const inside = (x: number) => x >= 0 && x <= 1;
  const faults: ReadonlyArray<readonly [boolean, string]> = [
    [!(inside(a.sleeve) && inside(a.fold)), `out at ${t}`],
    [(w <= f0 && a.sleeve !== 0) || (w >= f1 && a.sleeve !== 1), `sleeve end at ${t}`],
    [(w <= g0 && a.fold !== 0) || (w >= g1 && a.fold !== 1), `fold end at ${t}`],
  ];
  return faults.filter(([fault]) => fault).map(([, what]) => what);
};

/** Where the weights, sorted by wrapped turn, fall back or jump across a quarter degree. */
const stepFaults = (samples: Array<readonly [number, number, number]>) => {
  const sorted = samples.toSorted((x, y) => x[0] - y[0]);
  const faults: Array<string> = [];
  for (let i = 1; i < sorted.length; i++) {
    const [w0, s0, d0] = sorted[i - 1]!;
    const [w1, s1, d1] = sorted[i]!;
    if (s1 < s0 || d1 < d0) faults.push(`not monotone at ${w1}`);
    const near = w1 - w0 <= 0.25 + 1e-9;
    if (near && (Math.abs(s1 - s0) > 0.04 || Math.abs(d1 - d0) > 0.02))
      faults.push(`jumps at ${w1}`);
  }
  return faults;
};

describe('limbBlend', () => {
  test('the painted part to the fade, the stroke past it, the fold from 60° to 90°', () => {
    const at = (t: number) => limbBlend(LIMB, { elbowRight: t });
    expect(LIMB.fade).toEqual([15, 25]);
    expect(LIMB.fold).toEqual([60, 90]);
    expect(at(0)).toEqual({ sleeve: 0, fold: 0 });
    expect(at(15)).toEqual({ sleeve: 0, fold: 0 });
    expect(at(20).sleeve).toBeCloseTo(0.5, 12);
    expect(at(25)).toEqual({ sleeve: 1, fold: 0 });
    expect(at(75).fold).toBeCloseTo(0.5, 12);
    expect(at(90)).toEqual({ sleeve: 1, fold: 1 });
    expect(at(-20)).toEqual(at(20));
    expect(at(340)).toEqual(at(20));
    expect(limbBlend(LIMB, { wristRight: 90, shoulderRight: 90 })).toEqual(at(0));
    expect(limbBlend({ ...LIMB, fade: [-2, -1] }, {}).sleeve).toBe(1);
  });

  test('exact ends, monotone, no jump, in [0, 1], the elbow alone, from -540° to 540°', () => {
    const bad: Array<string> = [];
    const samples: Array<readonly [number, number, number]> = [];
    const rnd = lcg(7);
    for (let t = -540; t <= 540; t += 0.25) {
      const noise = {
        shoulderRight: rnd() * 360 - 180,
        wristRight: rnd() * 360 - 180,
        lean: rnd(),
      };
      const a = limbBlend(LIMB, { elbowRight: t });
      const b = limbBlend(LIMB, { ...noise, elbowRight: t });
      if (a.sleeve !== b.sleeve || a.fold !== b.fold) bad.push(`other bones move it at ${t}`);
      const w = Math.abs(((((t + 180) % 360) + 360) % 360) - 180);
      bad.push(...endFaults(t, w, a));
      samples.push([w, a.sleeve, a.fold]);
    }
    bad.push(...stepFaults(samples));
    expect(bad).toEqual([]);
  });
});

const BAND = 12;
const BODY_COLOUR = [120, 90, 200] as const;
const flapSkeleton = (band: number): Skeleton => ({
  bones: [{ name: 'lean', pivot: [S[0], S[1] - 30], tip: S }, ...BONES],
  skin: { arm: [...CHAIN, 'lean'], body: ['lean'] },
  flaps: [
    {
      part: 'arm',
      from: 'body',
      bone: 'shoulderRight',
      body: 'lean',
      cap: 2,
      reach: 10,
      region: [
        [-STUB - 2, -40],
        [band + 2, -40],
        [band + 2, 50],
        [-STUB - 2, 50],
      ].map(([u, v]) => along(along(S, D, u!), OUTER, v!)),
    },
  ],
  limbs: [DECLARED],
});
const flapSheet = (band: number): PuppetSheet => ({
  ...SHEET,
  parts: [
    ...SHEET.parts,
    {
      name: 'body',
      pixels: paint(W, H, (x, y) => {
        const [u, v] = frame([x + 0.5, y + 0.5], S, D, 0);
        const beside = u >= -STUB && u <= band && v > outerWidth(Math.max(0, u)) && v < 36;
        return [[], [BODY_COLOUR]][Number(beside)]!;
      }),
    },
  ],
});
const flapRefusals = (band: number) =>
  Result.getOrThrow(puppetOf(flapSheet(band), flapSkeleton(band))).refused.map(
    (l) => [l.kind, l.detail] as const,
  );

describe('puppetOf with a stroke limb', () => {
  /** Why `puppetOf` refused the first limb `skeleton` declares on `sheet`, the puppet built: its message, else 'built'. */
  const refusedFor = (skeleton: Skeleton, sheet: PuppetSheet = SHEET) =>
    Option.match(Option.fromUndefinedOr(Result.getOrThrow(puppetOf(sheet, skeleton)).refused[0]), {
      onNone: () => 'built',
      onSome: (r) => r.detail,
    });

  test('attaches the measured limb to its part, and rasterOf draws the part as without it at the painted turns', () => {
    const withLimb = Result.getOrThrow(puppetOf(SHEET, SKELETON));
    const without = Result.getOrThrow(puppetOf(SHEET, { ...SKELETON, limbs: [] }));
    expect(withLimb.parts[0]!.limb).toEqual(LIMB);
    expect(without.parts[0]!.limb).toBeUndefined();
    for (const elbowRight of [0, 10, 15]) {
      const pose = { numbers: { elbowRight, wristRight: -38 }, root: S, scale: 1 };
      expect(
        Buffer.compare(
          Buffer.from(rasterOf(withLimb, pose).rgba),
          Buffer.from(rasterOf(without, pose).rgba),
        ),
      ).toBe(0);
    }
  });

  test('refuses each declaration that does not fit, naming it, and still builds the puppet', () => {
    const limbs = (...l: ReadonlyArray<PuppetLimb>): Skeleton => ({ ...SKELETON, limbs: l });
    expect(refusedFor(limbs({ ...DECLARED, part: 'leg' }))).toBe(
      'a limb names no part leg of the sheet',
    );
    expect(refusedFor(limbs(DECLARED, DECLARED))).toBe('two limbs name part arm');
    expect(
      refusedFor(limbs({ ...DECLARED, bones: ['shoulderRight', 'elbowRight', 'thumb'] })),
    ).toBe("arm's limb names no bone thumb");
    expect(
      refusedFor(limbs({ ...DECLARED, bones: ['shoulderRight', 'wristRight', 'elbowRight'] })),
    ).toBe("arm's limb bones shoulderRight, wristRight, elbowRight are not a parent chain");
    expect(refusedFor({ ...SKELETON, skin: { arm: ['shoulderRight', 'elbowRight'] } })).toBe(
      "arm's limb lies on wristRight, which its skin does not name",
    );
    expect(refusedFor(limbs({ ...DECLARED, fade: [25, 15] }))).toBe(
      "arm's limb's fade 25–15 does not increase",
    );
    expect(refusedFor(limbs({ ...DECLARED, fold: [60, Number.NaN] }))).toBe(
      "arm's limb's fold 60–NaN does not increase",
    );
  });

  test("refuses a declared limb its part's pixels cannot measure, with limbOf's reason, the part left painted", () => {
    const bare = { ...SHEET, parts: [{ name: 'arm', pixels: armPixels(NONE) }] };
    const made = Result.getOrThrow(puppetOf(bare, SKELETON));
    expect(made.refused.map((r) => r.message)).toEqual([
      "arm cannot be measured as a stroke limb (no-ink): no knot's edge shows a texel under L* 20",
    ]);
    expect(made.parts[0]!.limb).toBeUndefined();
    const painted = Result.getOrThrow(puppetOf(bare, { ...SKELETON, limbs: [] }));
    for (const elbowRight of [0, 45, 90]) {
      const pose = { numbers: { elbowRight, wristRight: -38 }, root: S, scale: 1 };
      expect(
        Buffer.compare(
          Buffer.from(rasterOf(made, pose).rgba),
          Buffer.from(rasterOf(painted, pose).rgba),
        ),
      ).toBe(0);
    }
  });

  test('refuses every limb it cannot measure, each typed, and keeps the one it can', () => {
    const chainOf = (side: string) => [`shoulder${side}`, `elbow${side}`, `wrist${side}`] as const;
    const bonesOf = (side: string) => {
      const [shoulder, elbow, wrist] = chainOf(side);
      return [
        { name: shoulder, pivot: S, tip: E },
        { name: elbow, parent: shoulder, pivot: E, tip: C },
        { name: wrist, parent: elbow, pivot: C, tip: along(C, D, 20) },
      ];
    };
    const skeleton: Skeleton = {
      bones: [...BONES, ...bonesOf('Left'), ...bonesOf('Third')],
      skin: { arm: [...CHAIN], arm2: [...chainOf('Left')], arm3: [...chainOf('Third')] },
      limbs: [
        DECLARED,
        { part: 'arm2', bones: chainOf('Left') },
        { part: 'arm3', bones: chainOf('Third') },
      ],
    };
    const sheet: PuppetSheet = {
      width: W,
      height: H,
      parts: [
        { name: 'arm', pixels: armPixels(NONE) },
        { name: 'arm2', pixels: DARK_SLEEVE },
        { name: 'arm3', pixels: ARM },
      ],
    };
    const made = Result.getOrThrow(puppetOf(sheet, skeleton));
    expect(made.refused.every(Schema.is(LimbRefused))).toBe(true);
    expect(made.refused.map((l) => [l.part, l.kind])).toEqual([
      ['arm', 'no-ink'],
      ['arm2', 'ink-unbounded'],
    ]);
    expect(made.parts.map((p) => Predicate.isNotUndefined(p.limb))).toEqual([false, false, true]);
  });

  test('a cuff that is not finite refuses the limb, typed, never throwing', () => {
    const skeleton = {
      ...SKELETON,
      limbs: [{ ...DECLARED, cuff: [Number.POSITIVE_INFINITY, 1] as Pt }],
    };
    const made = Result.getOrThrow(puppetOf(SHEET, skeleton));
    expect(made.refused.map((l) => l.kind)).toEqual(['non-finite']);
  });

  test("a flap's body texels past the shoulder stay out of the sleeve: not in its widths, wholly in the stub", () => {
    const limb = Result.getOrThrow(puppetOf(flapSheet(BAND), flapSkeleton(BAND))).parts[0]!.limb!;
    const near = Array.from(limb.outer.widths.subarray(0, Math.floor(BAND / limb.step)));
    expect(near.length).toBeGreaterThan(3);
    expect(near.filter((w, k) => Math.abs(w - outerWidth((k + 0.5) * limb.step)) > 1)).toEqual([]);
    const body = along(along(S, D, BAND / 2), OUTER, 31);
    expect(limbShares(limb, Math.floor(body[0]), Math.floor(body[1]))).toEqual([1, 0, 0]);
    const sleeve = along(along(S, D, BAND / 2), OUTER, 10);
    expect(limbShares(limb, Math.floor(sleeve[0]), Math.floor(sleeve[1]))).toEqual([0, 1, 0]);
  });

  test("a flap's band to half the upper arm builds, as the lead's 20.4 px band does; past half, it refuses the limb with its reach", () => {
    expect(flapRefusals(20.4)).toEqual([]);
    expect(flapRefusals(UPPER / 2 - 3)).toEqual([]);
    const past = flapRefusals(UPPER / 2 + 6);
    expect(past.map(([kind]) => kind)).toEqual(['flap-reach']);
    expect(past[0]![1]).toMatch(
      new RegExp(`reach u 6[23]\\.\\d px, 0 on the forearm, past ${(UPPER / 2).toFixed(1)} px`),
    );
  });

  test("a flap's body texel on the forearm refuses the limb, counting them", () => {
    const body = new Uint8Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const [u, v] = frame([x + 0.5, y + 0.5], S, D, 0);
        body[y * W + x] = Number(u > UPPER + 10 && u < UPPER + 20 && v > 30 && v < 34);
      }
    const r = limbOf('arm', ARM, JOINTS, DECLARED, Option.some(body));
    expect(kindOf(r)).toBe('flap-reach');
    expect(Result.isFailure(r) && r.failure.detail).toMatch(/, [1-9]\d* on the forearm, /);
  });
});
