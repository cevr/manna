import { describe, expect, test } from 'bun:test';
import { Option, Result, Schema } from 'effect';
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
const toSegment = (p: Pt, a: Pt, d: Pt, l: number) => {
  const q = sub(p, a);
  const t = Math.max(0, Math.min(l, dot(q, d)));
  return Math.hypot(q[0] - t * d[0], q[1] - t * d[1]);
};

/** Which sides a fixture inks: `[inner, outer]`. */
type Inked = readonly [boolean, boolean];
const BOTH: Inked = [true, true];
const NONE: Inked = [false, false];

// A synthetic arm, 200 × 300 px: a straight chain tilted off the axes, its
// sleeve two flat shade planes of different half-widths each side, inked 4 px
// along the edges `Inked` names, a stub above the shoulder and a hand (a disc)
// past the cuff.
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
  if (Math.hypot(...sub([x + 0.5, y + 0.5], HAND)) <= 14 && u > CUFF) return [SKIN];
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

// A bent arm, 220 × 200 px, folded like the lead's right arm: the forearm
// turned 135° toward the inner side, a 45° angle inside the elbow. Each texel
// belongs to the segment it lies nearer (the elbow's own texels to the upper
// arm), within that segment's half-widths: inner 18 px on both, so the inner
// edges meet at a crease on the fold's bisector; outer tapering to 3 px at the
// elbow, where a 3 px disc of ink rounds the corner. The ink is 4 px deep, so
// the elbow's pivot lies in the outline's ink.
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
  const fore = toSegment(p, BE, BD2, B_FORE) < toSegment(p, BS, BD1, B_UPPER);
  const [u, v, lo, hi] = cells[Number(fore)]!;
  const side = Number(v >= 0);
  const half = [B_INNER, bentOuter(u)][side]!;
  if (u < lo || u > hi || Math.abs(v) > half) return [];
  return [[[DARK, LIGHT][side]!, INK][Number(Math.abs(v) > half - 4)]!];
};

const bentTexel = (x: number, y: number): ReadonlyArray<Rgb> => {
  const p: Pt = [x + 0.5, y + 0.5];
  if (Math.hypot(...sub(p, B_HAND)) <= 14 && frame(p, BE, BD2, 0)[0] > B_FORE) return [SKIN];
  if (Math.hypot(...sub(p, BE)) <= 3) return [INK];
  return bentSleeve(p);
};

const BENT = paint(BW, BH, bentTexel);
const BENT_LIMB = Result.getOrThrow(
  limbOf('arm', BENT, { shoulder: BS, elbow: BE, wrist: BC }, DECLARED),
);
const FOLD_SLOPE = Math.tan(Math.PI / 8);

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

  // The acceptance's property (spec, check B) over the rule's whole domain.
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

// The straight arm with a body part beside its outer edge near the shoulder,
// reaching `band` px past the shoulder's line, which a flap takes into the arm.
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
  Result.match(puppetOf(flapSheet(band), flapSkeleton(band)), {
    onSuccess: () => [],
    onFailure: (e) => (e.limbs ?? []).map((l) => [l.kind, l.detail] as const),
  });

describe('puppetOf with a stroke limb', () => {
  const refusedFor = (skeleton: Skeleton) =>
    Result.match(puppetOf(SHEET, skeleton), {
      onSuccess: () => 'built',
      onFailure: (e) => e.reason,
    });

  test('attaches the measured limb to its part, and rasterOf draws the part as without it at the painted turns', () => {
    const withLimb = Result.getOrThrow(puppetOf(SHEET, SKELETON));
    const without = Result.getOrThrow(puppetOf(SHEET, { ...SKELETON, limbs: [] }));
    expect(withLimb.parts[0]!.limb).toEqual(LIMB);
    expect(without.parts[0]!.limb).toBeUndefined();
    for (const elbowRight of [0, 10, 15]) {
      const pose = { numbers: { elbowRight, wristRight: -38 }, root: S, scale: 1 };
      expect(rasterOf(withLimb, pose).rgba).toEqual(rasterOf(without, pose).rgba);
    }
  });

  test('refuses each declaration that does not fit, naming it', () => {
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

  test("refuses a declared limb its part's pixels cannot measure, with limbOf's reason", () => {
    const bare = { ...SHEET, parts: [{ name: 'arm', pixels: armPixels(NONE) }] };
    const reason = Result.match(puppetOf(bare, SKELETON), {
      onSuccess: () => 'built',
      onFailure: (e) => e.reason,
    });
    expect(reason).toBe(
      "arm cannot be measured as a stroke limb (no-ink): no knot's edge shows a texel under L* 20",
    );
  });

  test('refuses every limb it cannot measure, each typed, not the first as a string', () => {
    const left = ['shoulderLeft', 'elbowLeft', 'wristLeft'] as const;
    const skeleton: Skeleton = {
      bones: [
        ...BONES,
        { name: 'shoulderLeft', pivot: S, tip: E },
        { name: 'elbowLeft', parent: 'shoulderLeft', pivot: E, tip: C },
        { name: 'wristLeft', parent: 'elbowLeft', pivot: C, tip: along(C, D, 20) },
      ],
      skin: { arm: [...CHAIN], arm2: [...left] },
      limbs: [DECLARED, { part: 'arm2', bones: left }],
    };
    const sheet: PuppetSheet = {
      width: W,
      height: H,
      parts: [
        { name: 'arm', pixels: armPixels(NONE) },
        { name: 'arm2', pixels: DARK_SLEEVE },
      ],
    };
    const limbs = Result.match(puppetOf(sheet, skeleton), {
      onSuccess: () => [],
      onFailure: (e) => e.limbs ?? [],
    });
    expect(limbs.every(Schema.is(LimbRefused))).toBe(true);
    expect(limbs.map((l) => [l.part, l.kind])).toEqual([
      ['arm', 'no-ink'],
      ['arm2', 'ink-unbounded'],
    ]);
  });

  test('a cuff that is not finite refuses the puppet with the typed limb, never throwing', () => {
    const skeleton = {
      ...SKELETON,
      limbs: [{ ...DECLARED, cuff: [Number.POSITIVE_INFINITY, 1] as Pt }],
    };
    const kinds = Result.match(puppetOf(SHEET, skeleton), {
      onSuccess: () => [],
      onFailure: (e) => (e.limbs ?? []).map((l) => l.kind),
    });
    expect(kinds).toEqual(['non-finite']);
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
