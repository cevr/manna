import { describe, expect, test } from 'bun:test';
import { Result } from 'effect';
import { type PuppetLimb, type PuppetPartLimb, limbBlend, limbOf, limbShares } from './limb.ts';
import { type Skeleton, boneTransforms, puppetOf, rasterOf } from './puppet.ts';

type Pt = readonly [number, number];
type PuppetSheet = Parameters<typeof puppetOf>[0];

// A synthetic arm, 200 × 300 px: a straight chain tilted off the axes, its
// sleeve two flat shade planes of different half-widths each side, inked 4 px
// along both edges, a stub above the shoulder and a hand (a disc) past the cuff.
const [W, H] = [200, 300];
const S: Pt = [60, 40];
const E: Pt = [90, 150];
const C: Pt = [117, 249];
const D: Pt = [30 / Math.hypot(30, 110), 110 / Math.hypot(30, 110)];
/** The side a positive elbow turn opens, as the fixture draws it. */
const OUTER: Pt = [D[1], -D[0]];
const UPPER = Math.hypot(30, 110);
const CUFF = UPPER + Math.hypot(27, 99);
const outerWidth = (u: number) => 26 - 0.03 * u;
const innerWidth = (u: number) => 20 - 0.02 * u;
const INK = [34, 15, 3] as const;
const LIGHT = [236, 214, 178] as const;
const DARK = [196, 170, 136] as const;
const SKIN = [240, 170, 120] as const;
const STUB = 14;
const HAND: Pt = [C[0] + 14 * D[0], C[1] + 14 * D[1]];

const unrolled = (x: number, y: number): Pt => {
  const q: Pt = [x + 0.5 - S[0], y + 0.5 - S[1]];
  return [q[0] * D[0] + q[1] * D[1], q[0] * OUTER[0] + q[1] * OUTER[1]];
};

type Rgb = readonly [number, number, number];

/** The sleeve's colour at (u, v), or none off the sleeve. */
const sleeveAt = (u: number, v: number, inked: boolean): ReadonlyArray<Rgb> => {
  const w = Math.max(0, u);
  const sides: ReadonlyArray<readonly [number, Rgb]> = [
    [innerWidth(w), DARK],
    [outerWidth(w), LIGHT],
  ];
  const [half, plane] = sides[Number(v >= 0)]!;
  if (u < -STUB || u > CUFF || Math.abs(v) > half) return [];
  if (inked && Math.abs(v) > half - 4) return [INK];
  return [plane];
};

const texelAt = (x: number, y: number, inked: boolean): ReadonlyArray<Rgb> => {
  const [u, v] = unrolled(x, y);
  if (Math.hypot(x + 0.5 - HAND[0], y + 0.5 - HAND[1]) <= 14 && u > CUFF) return [SKIN];
  return sleeveAt(u, v, inked);
};

const armPixels = (inked: boolean) => {
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      for (const c of texelAt(x, y, inked)) rgba.set([...c, 255], (y * W + x) * 4);
  return { width: W, height: H, rgba };
};

const BONES: Skeleton['bones'] = [
  { name: 'shoulderRight', pivot: S, tip: E },
  { name: 'elbowRight', parent: 'shoulderRight', pivot: E, tip: C },
  { name: 'wristRight', parent: 'elbowRight', pivot: C, tip: [C[0] + 20 * D[0], C[1] + 20 * D[1]] },
];
const CHAIN = ['shoulderRight', 'elbowRight', 'wristRight'] as const;
const DECLARED: PuppetLimb = { part: 'arm', bones: CHAIN };
const SKELETON: Skeleton = {
  bones: BONES,
  skin: { arm: [...CHAIN] },
  limbs: [DECLARED],
};
const ARM = armPixels(true);
const SHEET: PuppetSheet = { width: W, height: H, parts: [{ name: 'arm', pixels: ARM }] };
const JOINTS = { shoulder: S, elbow: E, wrist: C };

const LIMB: PuppetPartLimb = Result.getOrThrow(limbOf('arm', ARM, JOINTS, DECLARED));

describe('limbOf', () => {
  test('a positive elbow turn swings the forearm away from the side the fixture calls outer', () => {
    const m = boneTransforms(BONES, { elbowRight: 30 });
    const moved: Pt = [m[6]! * C[0] + m[8]! * C[1] + m[10]!, m[7]! * C[0] + m[9]! * C[1] + m[11]!];
    expect((moved[0] - C[0]) * OUTER[0] + (moved[1] - C[1]) * OUTER[1]).toBeLessThan(-10);
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
    for (const side of [LIMB.outer, LIMB.inner])
      for (const d of side.inks) expect(Math.abs(d - 4)).toBeLessThanOrEqual(1);
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
    const kind = (r: ReturnType<typeof limbOf>) =>
      Result.match(r, { onSuccess: () => 'measured', onFailure: (e) => e.kind });
    expect(kind(limbOf('arm', ARM, { ...JOINTS, wrist: [E[0] + 1, E[1] + 2] }, DECLARED))).toBe(
      'short-chain',
    );
    const away = (p: Pt): Pt => [p[0] + 100, p[1]];
    expect(
      kind(limbOf('arm', ARM, { shoulder: away(S), elbow: away(E), wrist: away(C) }, DECLARED)),
    ).toBe('off-part');
    const full = { width: W, height: H, rgba: new Uint8Array(W * H * 4).fill(255) };
    expect(kind(limbOf('arm', full, JOINTS, DECLARED))).toBe('open-edge');
    expect(kind(limbOf('arm', armPixels(false), JOINTS, DECLARED))).toBe('no-ink');
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

describe('puppetOf with a stroke limb', () => {
  const refusedFor = (skeleton: Skeleton) =>
    Result.match(puppetOf(SHEET, skeleton), {
      onSuccess: () => 'built',
      onFailure: (e) => e.reason,
    });

  test('attaches the measured limb to its part, and rasterOf draws the part as without it', () => {
    const withLimb = Result.getOrThrow(puppetOf(SHEET, SKELETON));
    const without = Result.getOrThrow(puppetOf(SHEET, { ...SKELETON, limbs: [] }));
    expect(withLimb.parts[0]!.limb).toEqual(LIMB);
    expect(without.parts[0]!.limb).toBeUndefined();
    const pose = { numbers: { elbowRight: 45, wristRight: -38 }, root: S, scale: 1 };
    expect(rasterOf(withLimb, pose).rgba).toEqual(rasterOf(without, pose).rgba);
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
    const bare = { ...SHEET, parts: [{ name: 'arm', pixels: armPixels(false) }] };
    const reason = Result.match(puppetOf(bare, SKELETON), {
      onSuccess: () => 'built',
      onFailure: (e) => e.reason,
    });
    expect(reason).toBe(
      "arm cannot be measured as a stroke limb (no-ink): no knot's edge shows a texel under L* 20",
    );
  });
});
