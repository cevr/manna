import { Option, Record as Rec, Result, Schema } from 'effect';
import { type Rgb, labOf } from './cast-sheet-pixels.ts';
import type { Raster } from './raster.ts';

type Pt = readonly [number, number];

type Ramp = readonly [number, number];

const LIMB_FADE: Ramp = [15, 25];

const LIMB_FOLD: Ramp = [60, 90];

export const INK_L = 20;

const KNOT = 2;

export const FEATHER = 2;

const SHORTEST = 2 * FEATHER;

const FLAP_REACH = 0.5;

const FOLDED_BACK = 2 ** -20;

const MARCH = 0.25;

const INK_STEP = 0.5;

export interface PuppetLimb {
  readonly part: string;
  readonly bones: readonly [string, string, string];
  readonly cuff?: Pt;
  readonly fade?: Ramp;
  readonly fold?: Ramp;
}

interface LimbRule {
  readonly bones: readonly [string, string, string];
  readonly fade: Ramp;
  readonly fold: Ramp;
}

interface LimbChain {
  readonly shoulder: Pt;
  readonly elbow: Pt;
  readonly cuff: Pt;
  readonly upper: number;
  readonly fore: number;
}

export type LimbSideName = 'outer' | 'inner';

type LimbEnd = 'fold' | 'ink' | 'bare' | 'unbounded';

interface LimbSide {
  readonly widths: Float64Array;
  readonly inks: Float64Array;
  readonly ends: ReadonlyArray<LimbEnd>;
}

interface LimbStation {
  readonly u: number;
  readonly outer: number;
  readonly inner: number;
}

export interface LimbStations {
  readonly shoulder: LimbStation;
  readonly elbowUpper: LimbStation;
  readonly elbowFore: LimbStation;
  readonly cuff: LimbStation;
  readonly crease: Pt;
}

interface LimbRegions {
  readonly box: readonly [number, number, number, number];
  readonly shares: DataView;
  readonly cloth: DataView;
}

export interface PuppetPartLimb extends LimbRule {
  readonly chain: LimbChain;
  readonly step: number;
  readonly outer: LimbSide;
  readonly inner: LimbSide;
  readonly ink: Rgb;
  readonly inkWidth: number;
  readonly regions: LimbRegions;
  readonly stations: LimbStations;
}

interface LimbJoints {
  readonly shoulder: Pt;
  readonly elbow: Pt;
  readonly wrist: Pt;
}

const LimbRefusalKind = Schema.Literals([
  'non-finite',
  'short-chain',
  'flap-reach',
  'off-part',
  'open-edge',
  'no-ink',
  'ink-unbounded',
  'no-station',
]);
type LimbRefusalKind = typeof LimbRefusalKind.Type;

export class LimbRefused extends Schema.TaggedError<LimbRefused>()('LimbRefused', {
  part: Schema.String,
  kind: LimbRefusalKind,
  detail: Schema.String,
}) {
  override get message() {
    return `${this.part} cannot be measured as a stroke limb (${this.kind}): ${this.detail}`;
  }
}

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

const ramp = ([a, b]: Ramp, x: number) => {
  const s = clamp01((x - a) / (b - a));
  return s * s * (3 - 2 * s);
};

interface LimbShown {
  readonly sleeve: number;
  readonly fold: number;
}

export const limbBlend = (limb: LimbRule, numbers: Readonly<Record<string, number>>): LimbShown => {
  const t = Option.getOrElse(Rec.get(numbers, limb.bones[1]), () => 0);
  const bend = Math.abs(((((t + 180) % 360) + 360) % 360) - 180);
  return { sleeve: ramp(limb.fade, bend), fold: ramp(limb.fold, bend) };
};

export const limbShares = (
  limb: PuppetPartLimb,
  x: number,
  y: number,
): readonly [number, number, number] => {
  const [bx, by, bw, bh] = limb.regions.box;
  const i = Math.max(0, Math.min(bh - 1, y - by)) * bw + Math.max(0, Math.min(bw - 1, x - bx));
  const view = limb.regions.shares;
  const [stub, hand] = [view.getUint8(2 * i), view.getUint8(2 * i + 1)];
  return [stub / 255, (255 - stub - hand) / 255, hand / 255];
};

const bytes = (a: Uint8Array) => new DataView(a.buffer, a.byteOffset, a.byteLength);

export const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
export const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];
export const unit = (a: Pt): Pt => {
  const l = Math.hypot(a[0], a[1]);
  return [a[0] / l, a[1] / l];
};
export const opens = (d: Pt): Pt => [d[1], -d[0]];

const toSegment = (p: Pt, a: Pt, d: Pt, l: number) => {
  const q = sub(p, a);
  const t = Math.max(0, Math.min(l, dot(q, d)));
  return Math.hypot(q[0] - t * d[0], q[1] - t * d[1]);
};

const unroll = (chain: LimbChain, p: Pt): Pt => {
  const across = (a: Pt, b: Pt, from: number): Pt => {
    const d = unit(sub(b, a));
    const q = sub(p, a);
    return [from + dot(q, d), dot(q, opens(d))];
  };
  if (onUpper(chain, p)) return across(chain.shoulder, chain.elbow, 0);
  return across(chain.elbow, chain.cuff, chain.upper);
};

const onUpper = (chain: LimbChain, p: Pt) =>
  toSegment(p, chain.shoulder, unit(sub(chain.elbow, chain.shoulder)), chain.upper) <=
  toSegment(p, chain.elbow, unit(sub(chain.cuff, chain.elbow)), chain.fore);

const pointAt = (chain: LimbChain, u: number): readonly [Pt, Pt] => {
  const on = (a: Pt, b: Pt, from: number): readonly [Pt, Pt] => {
    const d = unit(sub(b, a));
    return [[a[0] + (u - from) * d[0], a[1] + (u - from) * d[1]], opens(d)];
  };
  if (u > chain.upper) return on(chain.elbow, chain.cuff, chain.upper);
  return on(chain.shoulder, chain.elbow, 0);
};

const texels = (pixels: Raster, body: Uint8Array) => {
  const view = bytes(pixels.rgba);
  const flap = bytes(body);
  const { width: W, height: H } = pixels;
  const holds = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const byte = (x: number, y: number, c: number) => view.getUint8((y * W + x) * 4 + c);
  const isBody = (x: number, y: number) => flap.getUint8(y * W + x) > 0;
  const alpha = (sx: number, sy: number) => {
    const [fx, fy] = [sx - 0.5, sy - 0.5];
    const [x0, y0] = [Math.floor(fx), Math.floor(fy)];
    const [ax, ay] = [fx - x0, fy - y0];
    const at = (x: number, y: number) =>
      Number(holds(x, y) && !isBody(x, y)) && byte(x, y, 3) / 255;
    return (
      (1 - ay) * ((1 - ax) * at(x0, y0) + ax * at(x0 + 1, y0)) +
      ay * ((1 - ax) * at(x0, y0 + 1) + ax * at(x0 + 1, y0 + 1))
    );
  };
  const rgb = (x: number, y: number): Rgb => [byte(x, y, 0), byte(x, y, 1), byte(x, y, 2)];
  return { holds, byte, alpha, rgb, isBody };
};

type Texels = ReturnType<typeof texels>;

interface Reach {
  readonly width: number;
  readonly edge: boolean;
}

const reachFrom = (
  t: Texels,
  chain: LimbChain,
  p: Pt,
  n: Pt,
): Result.Result<Reach, readonly [LimbRefusalKind, string]> => {
  const at = `(${p[0].toFixed(1)}, ${p[1].toFixed(1)})`;
  if (t.alpha(p[0], p[1]) < 0.5)
    return Result.fail(['off-part', `the chain at ${at} lies off its paint`]);
  const upper = onUpper(chain, p);
  let [s, before] = [0, t.alpha(p[0], p[1])];
  for (;;) {
    const next = s + MARCH;
    const q: Pt = [p[0] + next * n[0], p[1] + next * n[1]];
    if (!t.holds(Math.floor(q[0]), Math.floor(q[1])))
      return Result.fail(['open-edge', `the paint from ${at} runs off the sheet`]);
    if (onUpper(chain, q) !== upper) return Result.succeed({ width: s, edge: false });
    const a = t.alpha(q[0], q[1]);
    if (a < 0.5)
      return Result.succeed({ width: s + (MARCH * (before - 0.5)) / (before - a), edge: true });
    [s, before] = [next, a];
  }
};

interface Run {
  readonly found: ReadonlyArray<Rgb>;
  readonly depth: number;
  readonly bounded: boolean;
}

const inkFrom = (t: Texels, p: Pt, n: Pt, w: number): Run => {
  const found: Array<Rgb> = [];
  let depth = 0;
  for (let s = INK_STEP / 2; s < w; s += INK_STEP) {
    const [x, y] = [Math.floor(p[0] + (w - s) * n[0]), Math.floor(p[1] + (w - s) * n[1])];
    if (t.byte(x, y, 3) < 128) continue;
    const c = t.rgb(x, y);
    if (labOf(c)[0] >= INK_L) return { found, depth, bounded: true };
    found.push(c);
    depth = s + INK_STEP / 2;
  }
  return { found, depth, bounded: false };
};

const median = (xs: ReadonlyArray<number>) => {
  const sorted = xs.toSorted((a, b) => a - b);
  const mid = Math.floor((sorted.length - 1) / 2);
  return (
    (Option.getOrElse(Option.fromUndefinedOr(sorted[mid]), () => 0) +
      Option.getOrElse(Option.fromUndefinedOr(sorted[sorted.length - 1 - mid]), () => 0)) /
    2
  );
};

const paintBox = (pixels: Raster, t: Texels) => {
  let [x0, y0, x1, y1] = [pixels.width, pixels.height, -1, -1];
  for (let y = 0; y < pixels.height; y++)
    for (let x = 0; x < pixels.width; x++)
      if (t.byte(x, y, 3) > 0)
        [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  return [x0, y0, Math.max(0, x1 - x0 + 1), Math.max(0, y1 - y0 + 1)] as const;
};

interface Sides {
  readonly sides: Record<LimbSideName, LimbSide>;
  readonly found: ReadonlyArray<Rgb>;
}

const measureSides = (
  t: Texels,
  chain: LimbChain,
  knots: number,
  step: number,
): Result.Result<Sides, readonly [LimbRefusalKind, string]> => {
  const sign: Record<LimbSideName, number> = { outer: 1, inner: -1 };
  const made = (): LimbSide & { ends: Array<LimbEnd> } => ({
    widths: new Float64Array(knots),
    inks: new Float64Array(knots),
    ends: [],
  });
  const sides = { outer: made(), inner: made() };
  const found: Array<Rgb> = [];
  for (let k = 0; k < knots; k++) {
    const [p, o] = pointAt(chain, (k + 0.5) * step);
    for (const side of ['outer', 'inner'] as const) {
      const n: Pt = [o[0] * sign[side], o[1] * sign[side]];
      const reach = reachFrom(t, chain, p, n);
      if (Result.isFailure(reach)) return Result.fail(reach.failure);
      const { width, edge } = reach.success;
      sides[side].widths[k] = width;
      if (!edge) {
        sides[side].ends.push('fold');
        continue;
      }
      const run = inkFrom(t, p, n, width);
      const end = endOf(run);
      sides[side].ends.push(end);
      if (end !== 'ink') continue;
      found.push(...run.found);
      sides[side].inks[k] = run.depth;
    }
  }
  return Result.succeed({ sides, found });
};

const endOf = (run: Run): LimbEnd => {
  if (run.found.length === 0) return 'bare';
  if (run.bounded) return 'ink';
  return 'unbounded';
};

const finite = (p: Pt) => Number.isFinite(p[0]) && Number.isFinite(p[1]);

const cuffEdgeOf = (t: Texels, chain: LimbChain, cuff: LimbStation, inkWidth: number) => {
  const length = chain.upper + chain.fore;
  const d = unit(sub(chain.cuff, chain.elbow));
  const n = opens(d);
  const lo = Math.ceil(cuff.inner);
  const edges = new Map<number, number>();
  const at = (u: number, v: number): Pt => [
    Math.floor(chain.elbow[0] + (u - chain.upper) * d[0] + v * n[0]),
    Math.floor(chain.elbow[1] + (u - chain.upper) * d[1] + v * n[1]),
  ];
  const colours = (from: number, to: number) => {
    const labs: Array<Rgb> = [];
    for (let u = from; u <= to; u += INK_STEP) {
      const [x, y] = at(u, 0);
      if (!t.holds(x, y) || t.byte(x, y, 3) < 128) continue;
      const lab = labOf(t.rgb(x, y));
      if (lab[0] >= INK_L) labs.push(lab);
    }
    return labs;
  };
  const clothPaint = colours(length - 2 * inkWidth, length - inkWidth);
  if (clothPaint.length === 0) return Result.fail('no cloth on the cuff axis');
  const cloth: Rgb = [
    median(clothPaint.map((l) => l[0])),
    median(clothPaint.map((l) => l[1])),
    median(clothPaint.map((l) => l[2])),
  ];
  const chroma = (lab: Rgb, of: Rgb) => Math.hypot(lab[1] - of[1], lab[2] - of[2]);
  const reach = Math.max(cuff.inner, cuff.outer);
  const skin = colours(length, length + reach).toSorted(
    (a, b) => chroma(b, cloth) - chroma(a, cloth),
  )[0];
  if (!skin || chroma(skin, cloth) === 0) return Result.fail('no distinct skin on the cuff axis');
  const skinEdge = (v: number) => {
    let first = Number.POSITIVE_INFINITY,
      start = Number.POSITIVE_INFINITY;
    for (let s = length - 2 * inkWidth; s <= length + reach; s += INK_STEP) {
      const [x, y] = at(s, v);
      const opaque = t.holds(x, y) && t.byte(x, y, 3) >= 128;
      if (!opaque) {
        start = Number.POSITIVE_INFINITY;
        if (s >= length) break;
        continue;
      }
      const lab = labOf(t.rgb(x, y));
      if (lab[0] >= INK_L && chroma(lab, skin) < chroma(lab, cloth)) {
        first = Math.min(first, s);
        start = Math.min(start, s);
        if (s - start + INK_STEP >= inkWidth / 2) {
          first = start;
          break;
        }
      } else start = Number.POSITIVE_INFINITY;
    }
    return first;
  };
  for (let i = 0; i <= lo + Math.ceil(cuff.outer); i++) {
    const first = skinEdge(i - lo);
    if (Number.isFinite(first)) edges.set(i, first);
  }
  if (edges.size === 0) return Result.fail('no skin boundary across the cuff');
  const measured = [...edges.entries()];
  const nearestEdge = (i: number) =>
    measured.reduce((a, b) => {
      if (Math.abs(b[0] - i) < Math.abs(a[0] - i)) return b;
      return a;
    })[1];
  const measuredEdges = new Float64Array(lo + Math.ceil(cuff.outer) + 1);
  for (let i = 0; i < measuredEdges.length; i++) measuredEdges[i] = nearestEdge(i);
  return Result.succeed({
    edge: (v: number) => {
      const i = Math.max(0, Math.min(measuredEdges.length - 1, Math.round(v) + lo));
      return Option.getOrThrow(Option.fromUndefinedOr(measuredEdges[i]));
    },
    cloth: (x: number, y: number) => {
      const lab = labOf(t.rgb(x, y));
      return lab[0] >= INK_L && 2 * chroma(lab, cloth) <= chroma(lab, skin);
    },
  });
};

const regionsOf = (
  pixels: Raster,
  t: Texels,
  chain: LimbChain,
  cuff: { readonly edge: (v: number) => number; readonly cloth: (x: number, y: number) => boolean },
): LimbRegions => {
  const box = paintBox(pixels, t);
  const [bx, by, bw, bh] = box;
  const shares = new Uint8Array(bw * bh * 2);
  const cloth = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const [u, v] = unroll(chain, [bx + x + 0.5, by + y + 0.5]);
      const body = t.isBody(bx + x, by + y);
      const stub = Math.round(255 * Math.max(Number(body), clamp01(0.5 - u / FEATHER)));
      const hand = Number(!body && u >= cuff.edge(v)) * 255;
      shares.set([stub, hand], 2 * (y * bw + x));
      cloth[y * bw + x] = Number(hand === 0 && cuff.cloth(bx + x, by + y));
    }
  return { box, shares: bytes(shares), cloth: bytes(cloth) };
};

const crossTo = (t: Texels, p: Pt, n: Pt, [e, c]: readonly [Pt, Pt]): Option.Option<number> => {
  if (t.alpha(p[0], p[1]) < 0.5) return Option.none();
  const ec = sub(c, e);
  const side = (q: Pt) => ec[0] * (q[1] - e[1]) - ec[1] * (q[0] - e[0]);
  const onCrease = (q: Pt) => dot(ec, ec) > 0 && dot(sub(q, e), ec) >= 0;
  let [s, before, was] = [0, t.alpha(p[0], p[1]), side(p)];
  for (;;) {
    const next = s + MARCH;
    const q: Pt = [p[0] + next * n[0], p[1] + next * n[1]];
    if (!t.holds(Math.floor(q[0]), Math.floor(q[1]))) return Option.none();
    const now = side(q);
    if (was * now < 0 && onCrease(q)) return Option.some(s + (MARCH * was) / (was - now));
    const a = t.alpha(q[0], q[1]);
    if (a < 0.5) return Option.some(s + (MARCH * (before - 0.5)) / (before - a));
    [s, before, was] = [next, a, now || was];
  }
};

const creaseOf = (pixels: Raster, t: Texels, chain: LimbChain): Option.Option<Pt> => {
  const nu = opens(unit(sub(chain.elbow, chain.shoulder)));
  const nf = opens(unit(sub(chain.cuff, chain.elbow)));
  const length = chain.upper + chain.fore;
  const solid = (x: number, y: number) =>
    t.holds(x, y) && !t.isBody(x, y) && t.byte(x, y, 3) >= 128;
  const [bx, by, bw, bh] = paintBox(pixels, t);
  let [best, at] = [Infinity, Option.none<Pt>()];
  for (let y = by; y < by + bh; y++)
    for (let x = bx; x < bx + bw; x++) {
      if (!solid(x, y)) continue;
      if (solid(x - 1, y) && solid(x + 1, y) && solid(x, y - 1) && solid(x, y + 1)) continue;
      const p: Pt = [x + 0.5, y + 0.5];
      const r = sub(p, chain.elbow);
      if (dot(r, nu) >= 0 || dot(r, nf) >= 0) continue;
      const [u] = unroll(chain, p);
      const d = Math.hypot(r[0], r[1]);
      if (u < 0 || u > length || d >= best) continue;
      [best, at] = [d, Option.some(p)];
    }
  return at;
};

const stationsOf = (
  pixels: Raster,
  t: Texels,
  chain: LimbChain,
  step: number,
  reach: number,
): Result.Result<LimbStations, readonly [LimbRefusalKind, string]> => {
  const refuse = (detail: string) => Result.fail(['no-station', detail] as const);
  const found = creaseOf(pixels, t, chain);
  if (Option.isNone(found))
    return refuse('no edge of its paint lies inside the bend for the elbow to crease at');
  const crease = found.value;
  const nu = opens(unit(sub(chain.elbow, chain.shoulder)));
  const nf = opens(unit(sub(chain.cuff, chain.elbow)));
  const out: Pt = [nu[0] + nf[0], nu[1] + nf[1]];
  if (Math.hypot(out[0], out[1]) < FOLDED_BACK)
    return refuse(
      'its forearm folds straight back over its upper arm, so its elbow has no outer side',
    );
  const neg = (n: Pt): Pt => [-n[0], -n[1]];
  const length = chain.upper + chain.fore;
  const us = (Math.floor(Math.max(0, reach) / step - 0.5) + 1.5) * step;
  const [ps, os] = pointAt(chain, us);
  const [pc, oc] = pointAt(chain, length - FEATHER);
  const marches = {
    'shoulder outer': [ps, os],
    'shoulder inner': [ps, neg(os)],
    'outer elbow': [chain.elbow, unit(out)],
    'cuff outer': [pc, oc],
    'cuff inner': [pc, neg(oc)],
  } satisfies Record<string, readonly [Pt, Pt]>;
  const read = Rec.map(marches, ([p, n]) => crossTo(t, p, n, [chain.elbow, crease]));
  const missing = Object.keys(Rec.filter(read, Option.isNone));
  if (missing.length > 0)
    return refuse(`its ${missing.join(', ')} march starts off its paint or runs off the sheet`);
  const w = (k: keyof typeof marches) => Option.getOrElse(read[k], () => 0);
  const r = sub(crease, chain.elbow);
  return Result.succeed({
    shoulder: { u: us, outer: w('shoulder outer'), inner: w('shoulder inner') },
    elbowUpper: { u: chain.upper, outer: w('outer elbow'), inner: -dot(r, nu) },
    elbowFore: { u: chain.upper, outer: w('outer elbow'), inner: -dot(r, nf) },
    cuff: { u: length - FEATHER, outer: w('cuff outer'), inner: w('cuff inner') },
    crease,
  });
};

const flapReach = (pixels: Raster, t: Texels, chain: LimbChain) => {
  let [u, fore] = [-Infinity, 0];
  for (let y = 0; y < pixels.height; y++)
    for (let x = 0; x < pixels.width; x++) {
      if (!t.isBody(x, y)) continue;
      const p: Pt = [x + 0.5, y + 0.5];
      fore += Number(!onUpper(chain, p));
      u = Math.max(u, unroll(chain, p)[0]);
    }
  return { u, fore };
};

export const limbOf = (
  part: string,
  pixels: Raster,
  joints: LimbJoints,
  declared: PuppetLimb,
  body: Option.Option<Uint8Array> = Option.none(),
): Result.Result<PuppetPartLimb, LimbRefused> => {
  const refuse = (kind: LimbRefusalKind, detail: string) =>
    Result.fail(LimbRefused.make({ part, kind, detail }));
  const cuff = Option.getOrElse(Option.fromUndefinedOr(declared.cuff), () => joints.wrist);
  const points = { shoulder: joints.shoulder, elbow: joints.elbow, cuff };
  const bad = Object.entries(points).filter(([, p]) => !finite(p));
  if (bad.length > 0)
    return refuse(
      'non-finite',
      bad.map(([name, p]) => `its ${name} (${p[0]}, ${p[1]}) is not a finite point`).join('; '),
    );
  const chain: LimbChain = {
    shoulder: joints.shoulder,
    elbow: joints.elbow,
    cuff,
    upper: Math.hypot(...sub(joints.elbow, joints.shoulder)),
    fore: Math.hypot(...sub(cuff, joints.elbow)),
  };
  if (Math.min(chain.upper, chain.fore) < SHORTEST)
    return refuse(
      'short-chain',
      `its upper arm is ${chain.upper.toFixed(1)} px and its forearm ${chain.fore.toFixed(1)} px, under ${SHORTEST}`,
    );
  const t = texels(
    pixels,
    Option.getOrElse(body, () => new Uint8Array(pixels.width * pixels.height)),
  );
  const reach = flapReach(pixels, t, chain);
  if (reach.fore > 0 || reach.u > FLAP_REACH * chain.upper)
    return refuse(
      'flap-reach',
      `its flap's body texels reach u ${reach.u.toFixed(1)} px, ${reach.fore} on the forearm, past ${(FLAP_REACH * chain.upper).toFixed(1)} px (${FLAP_REACH} of its ${chain.upper.toFixed(1)} px upper arm)`,
    );
  const length = chain.upper + chain.fore;
  const knots = Math.ceil(length / KNOT);
  const step = length / knots;
  const measured = measureSides(t, chain, knots, step);
  if (Result.isFailure(measured)) return refuse(...measured.failure);
  const { sides, found } = measured.success;
  const count = (side: LimbSideName, end: LimbEnd) =>
    sides[side].ends.filter((e) => e === end).length;
  if (
    count('outer', 'ink') +
      count('inner', 'ink') +
      count('outer', 'unbounded') +
      count('inner', 'unbounded') ===
    0
  )
    return refuse('no-ink', `no knot's edge shows a texel under L* ${INK_L}`);
  const depths = [...sides.outer.inks, ...sides.inner.inks].filter((d) => d > 0);
  const channel = (c: 0 | 1 | 2) => median(found.map((x) => x[c]));
  const stations = stationsOf(pixels, t, chain, step, reach.u);
  if (Result.isFailure(stations)) return refuse(...stations.failure);
  return Option.match(
    Option.fromUndefinedOr(
      (['outer', 'inner'] as const).find((side) => count(side, 'ink') < count(side, 'unbounded')),
    ),
    {
      onSome: (side) =>
        refuse(
          'ink-unbounded',
          `on its ${side} side ${count(side, 'unbounded')} knots' dark runs reach the chain and ${count(side, 'ink')} end on cloth over L* ${INK_L}`,
        ),
      onNone: () =>
        Result.flatMap(
          Result.mapError(cuffEdgeOf(t, chain, stations.success.cuff, median(depths)), (detail) =>
            LimbRefused.make({ part, kind: 'no-station', detail }),
          ),
          (edge) =>
            Result.succeed({
              bones: declared.bones,
              fade: Option.getOrElse(Option.fromUndefinedOr(declared.fade), () => LIMB_FADE),
              fold: Option.getOrElse(Option.fromUndefinedOr(declared.fold), () => LIMB_FOLD),
              chain,
              step,
              outer: sides.outer,
              inner: sides.inner,
              ink: [channel(0), channel(1), channel(2)] as const,
              inkWidth: median(depths),
              regions: regionsOf(pixels, t, chain, edge),
              stations: stations.success,
            }),
        ),
    },
  );
};
