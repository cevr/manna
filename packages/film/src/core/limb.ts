// A stroke limb: a puppet's painted arm part (a sleeve with its hand) that may
// stand in, once its elbow bends past its fade, as a stroke drawn along its
// bone chain, shoulder → elbow → wrist. A skeleton declares one
// (`PuppetLimb`, `Skeleton.limbs` in `core/puppet.ts`); `puppetOf` measures it
// from the part's own pixels (`limbOf`) and attaches what it measured to the
// part (`PuppetPart.limb`), so both draw paths read the same numbers; and one
// rule (`limbBlend`) says, from the elbow's turn alone, how much of the stroke
// and of its fold line a pose shows. Pure.
//
// - **Unroll.** At rest the chain is the polyline shoulder pivot → elbow pivot
//   → cuff. A texel's `u` is its distance along the chain from the shoulder
//   (negative above it, past the cuff on the hand), its `v` its distance
//   across, positive on the side a positive elbow turn opens (the bend's
//   outer side: a turn runs from +x toward +y, so the forearm swings toward
//   the other side). A texel belongs to the segment it lies nearer.
// - **Widths.** At each knot (`step` px apart along the sleeve from the
//   shoulder to the cuff, each at the middle of its step), the distance
//   along ±v from the chain to where the part's alpha falls under one half,
//   each side apart, or, inside a fold the drawn view bends, to where the
//   other segment's texels begin.
// - **Ink.** From each alpha edge inward, the run of texels darker than
//   `INK_L`, counted only when it ends on lighter cloth before the chain: a
//   run that reaches the chain (a pivot drawn in a corner's ink, or cloth as
//   dark as ink) has no measured depth. Each knot keeps what its side ends on
//   (`LimbEnd`) and its ink's depth; the limb keeps the ink's colour (the
//   median of each channel over the bounded runs' texels) and width (the
//   median bounded depth).
// - **Regions.** Each texel lies in the stub (u < 0, the part's join to the
//   body, which stays painted), the sleeve (0 to the cuff's u, which the
//   stroke draws) or the hand (past the cuff, drawn from its own pixels on
//   the wrist bone), by its u, the borders feathered over `FEATHER` px: the
//   three shares sum to one at every texel.
// - The shade planes and the brush texture are not reduced to numbers: the
//   stroke samples the part's own texture through the unroll, so it carries
//   them as painted.

import { Option, Record as Rec, Result, Schema } from 'effect';
import { type Rgb, labOf } from './cast-sheet-pixels.ts';
import type { Raster } from './raster.ts';

type Pt = readonly [number, number];

/** A pair of degrees of the elbow's turn from its drawn view: where a ramp starts and where it ends. */
type Ramp = readonly [number, number];

/** The default fade: the painted part to 15°, the stroke alone from 25°; the probe's cut-out arm tore open past about 25° (`tmp/orchestrate/p5/probes/strokes/report.md`). */
const LIMB_FADE: Ramp = [15, 25];

/** The default fold: the forearm's ink fold line comes in from 60° and is whole at 90° (the probe's `final-fold-ink-2x.png`). */
const LIMB_FOLD: Ramp = [60, 90];

/** The CIE L* under which a texel at a sleeve's edge is its ink. The lead's ink (rgb 33 15 3) reads L* 0 to 15 on both arms of single-9, and his blue sleeve's darkest shade reaches L* 20; at 30, that shade reads as ink at two knots of its cut edge. */
const INK_L = 20;

/** The length of sleeve between two width knots, at most, px. */
const KNOT = 2;

/** The width over which one region gives way to the next, px. */
const FEATHER = 2;

/** The shortest a bone of the chain may be, px: two feathers, so the regions' borders never meet. */
const SHORTEST = 2 * FEATHER;

/** How far along the upper arm a flap's body texel may lie, of the upper arm's length: past it, or on the forearm, the body's pixels would ride the stroke's sleeve. The lead's right shoulder band reaches 20.4 px of a 154 px upper arm (0.13), his left 4.0 px of 176. */
const FLAP_REACH = 0.5;

/** The length under which the sum of the two segments' outer normals reads as none: the forearm folded straight back over the upper arm. */
const FOLDED_BACK = 2 ** -20;

/** How finely a width is marched along ±v, px. */
const MARCH = 0.25;

/** How finely the ink is read inward from the edge, px. */
const INK_STEP = 0.5;

/**
 * A stroke limb as a skeleton declares it: the painted part it stands for,
 * its chain (shoulder, elbow, wrist: each the parent of the next), where its
 * sleeve ends on the sheet (the wrist bone's pivot unless given), and its
 * fade and fold in degrees of the elbow's turn (`LIMB_FADE`, `LIMB_FOLD`
 * unless given).
 */
export interface PuppetLimb {
  readonly part: string;
  readonly bones: readonly [string, string, string];
  readonly cuff?: Pt;
  readonly fade?: Ramp;
  readonly fold?: Ramp;
}

/** What `limbBlend` reads: the chain's names and the two ramps. */
interface LimbRule {
  readonly bones: readonly [string, string, string];
  readonly fade: Ramp;
  readonly fold: Ramp;
}

/** A limb's rest chain, sheet px: its three points and the lengths of its two segments. */
interface LimbChain {
  readonly shoulder: Pt;
  readonly elbow: Pt;
  readonly cuff: Pt;
  readonly upper: number;
  readonly fore: number;
}

/** A side of a sleeve: `outer`, the side a positive elbow turn opens, or `inner`. */
type LimbSideName = 'outer' | 'inner';

/**
 * What a side's width ends on at a knot:
 * - `fold`: where the side meets the other segment's texels, the inside of a
 *   fold the drawn view bends. No edge is there, so no ink is read; the stroke
 *   rebuilds this side once the fold opens.
 * - `ink`: an alpha edge, inked, the dark run ending on lighter cloth.
 * - `bare`: an alpha edge with no ink, as a cut against the body.
 * - `unbounded`: an alpha edge whose dark run reaches the chain (the elbow's
 *   pivot drawn in the ink of a corner, or cloth as dark as ink): its ink is
 *   not measured there.
 */
type LimbEnd = 'fold' | 'ink' | 'bare' | 'unbounded';

/**
 * One side of a sleeve, at each knot: its half-width (px, to what `ends`
 * names), what it ends on, and the depth of its ink (px; 0 unless it ends on
 * `ink`).
 */
interface LimbSide {
  readonly widths: Float64Array;
  readonly inks: Float64Array;
  readonly ends: ReadonlyArray<LimbEnd>;
}

/** A cross-section of the sleeve on one segment's frame: at `u`, its half-width on each side, px. */
interface LimbStation {
  readonly u: number;
  readonly outer: number;
  readonly inner: number;
}

/**
 * The sleeve's three cross-sections, each read on the part's own pixels, that
 * give the stroke its width wherever a side's edge is hidden (a knot that
 * ends on `fold`):
 * - `shoulder`: across the upper arm at its first knot past a flap's body
 *   texels, each side to the paint's edge or the crease line, on the upper
 *   arm's frame.
 * - the elbow, from the outer elbow (the paint's edge along the outer
 *   bisector, the join's radius on that side) to the inner crease point
 *   (`crease`, the paint's edge texel nearest the elbow inside the bend):
 *   `elbowUpper` on the upper arm's frame, `elbowFore` on the forearm's.
 * - `cuff`: across the cuff opening, one feather inside the sleeve, on the
 *   forearm's frame.
 */
interface LimbStations {
  readonly shoulder: LimbStation;
  readonly elbowUpper: LimbStation;
  readonly elbowFore: LimbStation;
  readonly cuff: LimbStation;
  readonly crease: Pt;
}

/** A limb's regions over the box `[x, y, width, height]` that holds the part's paint: two bytes a texel, row by row, the stub's share and the hand's, of 255; the sleeve's is the rest. */
interface LimbRegions {
  readonly box: readonly [number, number, number, number];
  readonly shares: DataView;
}

/** A stroke limb as `puppetOf` measured it from its part's pixels: its rule, its rest chain, its knots `step` px apart along the sleeve, knot k at u = (k + ½) step (none on the shoulder's or the cuff's line, where a side's reach would read the paint's end), its two sides (`outer` the side a positive elbow turn opens), its ink's colour (the median of each channel) and width (the median depth where a side shows ink), and its regions. */
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

/** The rest joints a limb is measured on, sheet px: the shoulder's, elbow's and wrist's pivots. */
interface LimbJoints {
  readonly shoulder: Pt;
  readonly elbow: Pt;
  readonly wrist: Pt;
}

/**
 * Why a part cannot be measured as a limb: a point of its chain that is not
 * finite, a bone of its chain too short, its chain off its paint, its paint
 * running off the sheet, a flap's body texel on its forearm or past
 * `FLAP_REACH` of its upper arm, no ink at any of its edges, or more of its
 * edges' dark runs reaching the chain than ending on cloth (cloth as dark as
 * ink), or a station it cannot read (no crease inside the bend, a forearm
 * folded straight back, a station off its paint or running off the sheet).
 */
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

/** A part refused as a limb: which, the kind of refusal, and what was read. */
export class LimbRefused extends Schema.TaggedError<LimbRefused>()('LimbRefused', {
  part: Schema.String,
  kind: LimbRefusalKind,
  detail: Schema.String,
}) {
  override get message() {
    return `${this.part} cannot be measured as a stroke limb (${this.kind}): ${this.detail}`;
  }
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** 0 at or under `a`, 1 at or past `b`, 3s² − 2s³ between: exact at its ends, monotone, steepest 1.5 / (b − a) a degree. */
const ramp = ([a, b]: Ramp, x: number) => {
  const s = clamp01((x - a) / (b - a));
  return s * s * (3 - 2 * s);
};

/** How much of a limb a pose shows: its stroke over its painted part, and its fold line, each in [0, 1]. */
interface LimbShown {
  readonly sleeve: number;
  readonly fold: number;
}

/**
 * How much of `limb`'s stroke (`sleeve`) and of its fold line (`fold`) a pose
 * of bone numbers shows, each in [0, 1]: the ramps of the elbow's turn from
 * its drawn view, wrapped to 0..180°. Only the elbow counts: the shoulder
 * carries the whole arm rigid, and the wrist turning alone stays painted.
 * The one rule both draw paths call.
 */
export const limbBlend = (limb: LimbRule, numbers: Readonly<Record<string, number>>): LimbShown => {
  const t = Option.getOrElse(Rec.get(numbers, limb.bones[1]), () => 0);
  const bend = Math.abs(((((t + 180) % 360) + 360) % 360) - 180);
  return { sleeve: ramp(limb.fade, bend), fold: ramp(limb.fold, bend) };
};

/** The share of each region at texel `(x, y)` of `limb`'s part: stub, sleeve, hand, summing to one; a texel off the regions' box reads its nearest texel on the box. */
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

/** A byte view of `a`: reads that are typed numbers, and a RangeError past its end. */
const bytes = (a: Uint8Array) => new DataView(a.buffer, a.byteOffset, a.byteLength);

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];
const unit = (a: Pt): Pt => {
  const l = Math.hypot(a[0], a[1]);
  return [a[0] / l, a[1] / l];
};
/** The side a positive turn opens of a segment running along `d`: `d` turned a right angle against the turn. */
const opens = (d: Pt): Pt => [d[1], -d[0]];

/** The distance from `p` to the segment from `a` running `l` px along `d`. */
const toSegment = (p: Pt, a: Pt, d: Pt, l: number) => {
  const q = sub(p, a);
  const t = Math.max(0, Math.min(l, dot(q, d)));
  return Math.hypot(q[0] - t * d[0], q[1] - t * d[1]);
};

/** A texel's `(u, v)` on `chain` at rest: along the segment it lies nearer, the upper arm's line running on above the shoulder and the forearm's past the cuff. */
const unroll = (chain: LimbChain, p: Pt): Pt => {
  const across = (a: Pt, b: Pt, from: number): Pt => {
    const d = unit(sub(b, a));
    const q = sub(p, a);
    return [from + dot(q, d), dot(q, opens(d))];
  };
  if (onUpper(chain, p)) return across(chain.shoulder, chain.elbow, 0);
  return across(chain.elbow, chain.cuff, chain.upper);
};

/** Whether `p` lies nearer `chain`'s upper arm than its forearm (the elbow itself on the upper arm). */
const onUpper = (chain: LimbChain, p: Pt) =>
  toSegment(p, chain.shoulder, unit(sub(chain.elbow, chain.shoulder)), chain.upper) <=
  toSegment(p, chain.elbow, unit(sub(chain.cuff, chain.elbow)), chain.fore);

/** The point at `u` along `chain` (0 to the cuff) and the side a positive turn opens there. */
const pointAt = (chain: LimbChain, u: number): readonly [Pt, Pt] => {
  const on = (a: Pt, b: Pt, from: number): readonly [Pt, Pt] => {
    const d = unit(sub(b, a));
    return [[a[0] + (u - from) * d[0], a[1] + (u - from) * d[1]], opens(d)];
  };
  if (u > chain.upper) return on(chain.elbow, chain.cuff, chain.upper);
  return on(chain.shoulder, chain.elbow, 0);
};

/** A part's straight RGBA read texel by texel, in its bounds, with which of its texels are a flap's body pixels (`body`, a byte a texel, nonzero for the body's). */
const texels = (pixels: Raster, body: Uint8Array) => {
  const view = bytes(pixels.rgba);
  const flap = bytes(body);
  const { width: W, height: H } = pixels;
  const holds = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const byte = (x: number, y: number, c: number) => view.getUint8((y * W + x) * 4 + c);
  const isBody = (x: number, y: number) => flap.getUint8(y * W + x) > 0;
  /** The alpha (0..1) of the part's own paint at `(sx, sy)`, bilinear over texel centres (texel x's centre at x + ½), 0 off the part and on a flap's body pixels. */
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

/** A side's reach from a knot: how far, px, and whether it ended at the part's alpha edge (else where the other segment's texels begin). */
interface Reach {
  readonly width: number;
  readonly edge: boolean;
}

/**
 * How far from `p` (a knot of `chain`) along `n` the part's alpha falls under
 * one half, or the march meets the other segment's texels (`onUpper` turning),
 * px; refused when `p` is off its paint or the paint runs off the sheet.
 */
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

/** A dark run read inward from an edge: its texels' colours, its depth (px), and whether it ended on an opaque texel at or over `INK_L` (bounded) rather than at the chain. */
interface Run {
  readonly found: ReadonlyArray<Rgb>;
  readonly depth: number;
  readonly bounded: boolean;
}

/** The dark run inward from the edge `w` px from `p` along `n`, to the first opaque texel that is not ink, or to `p` itself when there is none. */
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

/** The box `[x, y, width, height]` of the texels of `pixels` that hold any paint. */
const paintBox = (pixels: Raster, t: Texels) => {
  let [x0, y0, x1, y1] = [pixels.width, pixels.height, -1, -1];
  for (let y = 0; y < pixels.height; y++)
    for (let x = 0; x < pixels.width; x++)
      if (t.byte(x, y, 3) > 0)
        [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  return [x0, y0, Math.max(0, x1 - x0 + 1), Math.max(0, y1 - y0 + 1)] as const;
};

/** Each side's measure along the sleeve, and the colours of its bounded ink runs. */
interface Sides {
  readonly sides: Record<LimbSideName, LimbSide>;
  readonly found: ReadonlyArray<Rgb>;
}

/** Each side's width at every knot of `chain`, what it ends on, and its ink; refused when a knot is off the paint or the paint runs off the sheet. */
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

/** What a side's alpha edge is, as its dark run reads it. */
const endOf = (run: Run): LimbEnd => {
  if (run.found.length === 0) return 'bare';
  if (run.bounded) return 'ink';
  return 'unbounded';
};

const finite = (p: Pt) => Number.isFinite(p[0]) && Number.isFinite(p[1]);

/** The regions over the box of `pixels`' paint: each texel's stub and hand shares by its u on `chain`, a flap's body pixels wholly stub (painted, on the flap's weights, never redrawn by the stroke). */
const regionsOf = (pixels: Raster, t: Texels, chain: LimbChain): LimbRegions => {
  const length = chain.upper + chain.fore;
  const box = paintBox(pixels, t);
  const [bx, by, bw, bh] = box;
  const shares = new Uint8Array(bw * bh * 2);
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const [u] = unroll(chain, [bx + x + 0.5, by + y + 0.5]);
      const body = t.isBody(bx + x, by + y);
      const stub = Math.round(255 * Math.max(Number(body), clamp01(0.5 - u / FEATHER)));
      const hand = Number(!body) * Math.round(255 * clamp01(0.5 + (u - length) / FEATHER));
      shares.set([stub, hand], 2 * (y * bw + x));
    }
  return { box, shares: bytes(shares) };
};

/**
 * How far from `p` along `n` the paint's alpha stays at or over one half, px,
 * stopping where the march crosses the crease ray from `e` through `c` (past
 * it lies the other segment's paint, folded over this one; a ray, since a
 * station a knot past the crease point would miss a segment ending there);
 * none when `p` is off the paint or the march runs off the sheet.
 */
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

/**
 * The elbow's inner crease: the centre of the paint's edge texel (opaque, a
 * 4-neighbour clear, off the sheet or a flap's body texel) nearest the elbow
 * pivot among those on the sleeve and inside the bend (on the inner side of
 * both segments' lines); none when no edge lies there.
 */
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

/**
 * The limb's stations (`LimbStations`) on `chain`, the shoulder's at the
 * first knot (`step` apart) past `reach`, the farthest u a flap's body texel
 * lies at; refused when no crease lies inside the bend, the forearm folds
 * straight back (no outer side to the elbow), or a station's march starts off
 * the paint or runs off the sheet.
 */
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

/** How far a flap's body texels reach along `chain`: the greatest u of their centres (−∞ with none), and how many lie nearer the forearm. */
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

/**
 * Part `part`'s limb, measured from its own pixels (its texture, as
 * `puppetOf` holds it) on its rest joints: the chain, each side's half-widths
 * at every knot, what each ends on, and its ink, and the regions. The texels
 * `body` marks (a byte a texel, nonzero where a flap took the body's pixels
 * into the part) are not the sleeve's: a width ends where they begin, and
 * they lie wholly in the stub. Refused, with a reason that names its kind,
 * when a point of the chain is not finite, a bone of the chain is too short,
 * a body texel lies on the forearm or past `FLAP_REACH` of the upper arm (the
 * stub would carry it into the sleeve), the chain leaves the paint, the paint runs off the sheet, no edge shows any
 * ink, or more edges' dark runs reach the chain than end on cloth: such an
 * arm is never drawn from defaults.
 */
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
          regions: regionsOf(pixels, t, chain),
          stations: stations.success,
        }),
    },
  );
};
