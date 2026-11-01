// An okra answer laid into a view's part sheet, and measured. The answer is
// laid back over the view by one similarity fitted on colour where it still
// shows the view (`core/register.ts`). Its paint, each pixel the one answer
// pixel under its centre (`drawPoint`, so okra's grain is not averaged),
// is the answer less the paper the view's own ground reaches; each painted
// pixel goes under the nearest part that does not move, in that part's tone, and only through
// `paintHidden`, so paint never shows at rest. The measures are read on
// domains the sheet fixes before any answer is read: the drift over the
// pixels kept by the parts the hidden areas lie on, the seam and each such
// part's grain beside its paint, and each painted region's chroma and speck
// share (inside its edge ring, outlines left out) beside its part's kept cloth. A measure with too few samples to read is
// a missed bar, not a pass, and every moving part must hide some paint
// (`film concept parts`, `part-sheet-cli.ts`, keeps the best answer).

import { Array as Arr, Boolean as Bool, Option, Result, Schema } from 'effect';
import { componentsOf, deltaE, labOf, rgbAt } from '../core/cast-sheet-pixels.ts';
import { grainOf } from '../core/grain.ts';
import { type cutParts, paintHidden, recompose } from '../core/part-sheet.ts';
import type { Raster } from '../core/raster.ts';
import { drawPoint, drawSimilar, fitSimilarity } from '../core/register.ts';

/** A view's part sheet, as `cutParts` gives it. */
export type Sheet = ReturnType<typeof cutParts> extends Result.Result<infer A, unknown> ? A : never;

type Rgb = readonly [number, number, number];

/** The flat colour the moving parts' areas are painted for okra. */
const MAGENTA = [255, 0, 255, 255] as const;

/** The least ΔE76 from the answer's ground colour that is not its paper. */
const PAPER_NEAR = 6;

/** How far a kept pixel lies from paint to count in the kept grain, pixels, looked for on a 3 px lattice. */
const GRAIN_STEPS = Arr.range(-8, 8).map((k) => k * 3);

/** Lighter than this L* is paint, not ink, for the seam and the grain. */
const INK_L = 45;

/** The fewest seam pairs a seam is read on. */
const LEAST_SEAM_PAIRS = 20;

/** The fewest 3 × 3 windows a part's grain is read on, painted and kept each: about ten windows that share no pixel. */
const LEAST_GRAIN_WINDOWS = 90;

/** The fewest pixels a painted region's specks are read on, painted and kept each. */
const LEAST_REGION_PX = 100;

/** A pixel is a speck when its L* lies further than this from the median L* of its 5 × 5 neighbours of its own kind. */
const SPECK_L = 12;

/** Specks that join into a line this many pixels long or more, this many times as long as wide, are an outline, not speckle. */
const SPECK_LINE_PX = 4;
const SPECK_LINE_LONG = 3;

/** How far from its paint a part's kept pixels count beside it: for the specks (as the grain's reach), and for each painted pixel's chroma. */
const SPECK_REACH = 24;
const CHROMA_REACH = 6;

/** The fewest kept pixels within `CHROMA_REACH` that give a painted pixel its cloth. */
const LEAST_BESIDE_PX = 8;

/** The fewest pixel pairs a line where two parts' paint meets is read on: a line 8 px long. */
const LEAST_STEP_PAIRS = 8;

/** The side of the square cells a region's chroma is read in, and the fewest painted pixels with a cloth beside them a cell is read on. */
const CHROMA_CELL = 24;
const LEAST_CELL_PX = 40;

/**
 * The stage's bars: seam ΔE ≤ 10; drift ≤ 5, and in each read cell of a
 * painted region the paint's chroma at most 3 below the kept cloth's beside
 * it; each read part's paint grain within ±0.5 of its kept grain (robust
 * std); each read region's speck share, off its edge ring and outlines left
 * out, at most 0.04 above the kept cloth's; where two parts' paint meets, the
 * laid paint's mean L* step across the line within 5 of the answer's there;
 * no paint at rest.
 */
export const BARS = {
  seamDeltaE: 10,
  driftDeltaE: 5,
  chromaDrop: 3,
  grainWithin: 0.5,
  speckOver: 0.04,
  stepWithin: 5,
  visibleAtRest: 0,
  leastSeamPairs: LEAST_SEAM_PAIRS,
  leastStepPairs: LEAST_STEP_PAIRS,
  leastGrainWindows: LEAST_GRAIN_WINDOWS,
  leastRegionPx: LEAST_REGION_PX,
  leastCellPx: LEAST_CELL_PX,
} as const;

/** Whether pixel `i` of `r` is paint, lighter than the ink. */
const lightAt = (r: Raster, i: number) => labOf(rgbAt(r, i))[0] > INK_L;

/** The mean of `v`'s values, 0 for none. */
const meanOf = (v: ReadonlyArray<number>) => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);

/** The median of `v`'s values, 0 for none. */
const medianOf = (v: ReadonlyArray<number>) => [...v].sort((a, b) => a - b)[v.length >> 1] ?? 0;

const round2 = (v: number) => Math.round(v * 100) / 100;

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** Each pixel a moving part owns and is opaque on: what a pose may uncover. */
export const hiddenOf = (sheet: Sheet, moving: ReadonlyArray<string>): Uint8Array => {
  const ids = new Set(
    sheet.parts
      .map((p, k) => [p.name, k + 1] as const)
      .filter(([n]) => moving.includes(n))
      .map(([, id]) => id),
  );
  return Uint8Array.from(sheet.owner, (o, i) =>
    Number(ids.has(o) && sheet.parts[o - 1]?.pixels.rgba[i * 4 + 3] === 255),
  );
};

/** `view` with each `hidden` pixel flat magenta. */
export const magentaOf = (view: Raster, hidden: Uint8Array): Raster => {
  const rgba = Uint8Array.from(view.rgba);
  hidden.forEach((m, i) => m === 1 && rgba.set(MAGENTA, i * 4));
  return { width: view.width, height: view.height, rgba };
};

/** The median colour of `r` over the pixels `at` lists. */
const medianOver = (r: Raster, at: ReadonlyArray<number>): Rgb => {
  const median = (c: number) => medianOf(at.map((i) => r.rgba[i * 4 + c] ?? 0));
  return [median(0), median(1), median(2)];
};

/** A picture's ground colour: the median of its border. */
export const groundOf = (r: Raster): Rgb => {
  const { width: w, height: h } = r;
  return medianOver(r, [
    ...Arr.range(0, w - 1).flatMap((x) => [x, (h - 1) * w + x]),
    ...Arr.range(1, Math.max(1, h - 2)).flatMap((y) => [y * w, y * w + w - 1]),
  ]);
};

/** The four neighbours of pixel `i` inside a `w` × `h` picture. */
const neighbours = (i: number, w: number, h: number): ReadonlyArray<number> => {
  const [x, y] = [i % w, Math.floor(i / w)];
  const steps: ReadonlyArray<readonly [boolean, number]> = [
    [x > 0, i - 1],
    [x < w - 1, i + 1],
    [y > 0, i - w],
    [y < h - 1, i + w],
  ];
  return steps.filter(([inside]) => inside).map(([, j]) => j);
};

/**
 * The hidden pixels the answer paints: every one but the paper the view's
 * ground reaches through answer pixels of the answer's own ground colour
 * (its median where the view shows ground, near by the spread there).
 */
const paintedOf = (sheet: Sheet, hidden: Uint8Array, answer: Raster): Uint8Array => {
  const { width: w, height: h } = sheet;
  const ground = Arr.range(0, w * h - 1).filter((i) => sheet.owner[i] === 0);
  const lab = labOf(medianOver(answer, ground));
  const spread = ground.map((i) => deltaE(labOf(rgbAt(answer, i)), lab)).sort((a, b) => a - b);
  const near = Math.max(PAPER_NEAR, 1.5 * (spread[Math.floor(0.9 * (spread.length - 1))] ?? 0));
  const reached = new Uint8Array(w * h);
  const queue = [...ground];
  for (const i of ground) reached[i] = 1;
  for (let q = 0; q < queue.length; q++)
    for (const j of neighbours(queue[q] ?? 0, w, h))
      if (reached[j] === 0 && hidden[j] === 1 && deltaE(labOf(rgbAt(answer, j)), lab) <= near) {
        reached[j] = 1;
        queue.push(j);
      }
  return Uint8Array.from(hidden, (m, i) => Number(m === 1 && reached[i] === 0));
};

/** Each hidden pixel's part behind it (k + 1): the nearest part that does not move, through the hidden pixels four ways, the first found on a tie; 0 elsewhere. */
const behindOf = (sheet: Sheet, hidden: Uint8Array): Uint8Array => {
  const { width: w, height: h } = sheet;
  const behind = Uint8Array.from(sheet.owner, (o, i) => o * Number(hidden[i] === 0));
  const queue = Arr.range(0, w * h - 1).filter((i) => (behind[i] ?? 0) > 0);
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q] ?? 0;
    for (const j of neighbours(i, w, h))
      if (behind[j] === 0 && hidden[j] === 1) {
        behind[j] = behind[i] ?? 0;
        queue.push(j);
      }
  }
  return Uint8Array.from(behind, (b, i) => b * Number(hidden[i] === 1));
};

/** The mean RGB step from each piece of `mine` (four-way) to the pixels part `id` keeps beside it, both paint; a piece beside none has no step. */
const stepsOf = (view: Raster, sheet: Sheet, laid: Raster, mine: Uint8Array, id: number) => {
  const { width: w, height: h } = view;
  const { components, labels } = componentsOf(mine, w, h, false);
  const sums = components.map(() => [0, 0, 0, 0]);
  labels.forEach((l, i) => {
    const sum = Option.fromUndefinedOr(sums[l]).pipe(Option.filter(() => lightAt(laid, i)));
    if (Option.isNone(sum)) return;
    for (const j of neighbours(i, w, h).filter((j) => sheet.owner[j] === id && lightAt(view, j))) {
      for (let c = 0; c < 3; c++)
        sum.value[c] =
          (sum.value[c] ?? 0) + (view.rgba[j * 4 + c] ?? 0) - (laid.rgba[i * 4 + c] ?? 0);
      sum.value[3] = (sum.value[3] ?? 0) + 1;
    }
  });
  return { labels, steps: sums.map((s) => s.slice(0, 3).map((v) => v / Math.max(1, s[3] ?? 0))) };
};

/**
 * The laid answer in the tone of the parts it is laid under: each piece of
 * paint (four-way, under one part) shifted by the mean RGB step from it to
 * the pixels its part keeps beside it, both paint, so that no step of tone
 * shows where the paint meets the part. The ink keeps the answer's colour.
 */
const tonedTo = (
  view: Raster,
  sheet: Sheet,
  painted: Uint8Array,
  behind: Uint8Array,
  laid: Raster,
): Raster => {
  const rgba = Uint8Array.from(laid.rgba);
  for (const id of Arr.range(1, sheet.parts.length)) {
    const mine = Uint8Array.from(painted, (m, i) => Number(m === 1 && behind[i] === id));
    const { labels, steps } = stepsOf(view, sheet, laid, mine, id);
    labels.forEach((l, i) => {
      const step = Option.fromUndefinedOr(steps[l]).pipe(Option.filter(() => lightAt(laid, i)));
      if (Option.isNone(step)) return;
      for (let c = 0; c < 3; c++)
        rgba[i * 4 + c] = Math.max(
          0,
          Math.min(255, Math.round((laid.rgba[i * 4 + c] ?? 0) + (step.value[c] ?? 0))),
        );
    });
  }
  return { width: view.width, height: view.height, rgba };
};

/** `sheet` with the answer's paint laid under each part a moving part hides, at the pixels `painted` marks, each under its part behind, in that part's tone (`tonedTo`). */
const layHidden = (
  view: Raster,
  sheet: Sheet,
  behind: Uint8Array,
  painted: Uint8Array,
  laid: Raster,
) => {
  const answer = tonedTo(view, sheet, painted, behind, laid);
  const start: Result.Result<Sheet, { readonly message: string }> = Result.succeed(sheet);
  return Arr.reduce(
    sheet.parts.map((p, k) => ({ name: p.name, id: k + 1 })),
    start,
    (acc, part) =>
      Result.flatMap(acc, (s) => {
        const where = Uint8Array.from(painted, (m, i) => Number(m === 1 && behind[i] === part.id));
        return Bool.match(where.includes(1), {
          onTrue: () => paintHidden(s, part.name, answer, where),
          onFalse: () => Result.succeed(s),
        });
      }),
  );
};

/** A grain read: robust and plain std, and its windows. */
const GrainRead = Schema.Struct({ robust: Schema.Finite, plain: Schema.Finite, n: Schema.Int });

/** One part's grain beside its paint: read (both sides have enough windows) within the bar or outside it, or unverified. */
export const PartGrain = Schema.Struct({
  part: Schema.String,
  painted: GrainRead,
  kept: GrainRead,
  verdict: Schema.Literals(['within', 'outside', 'unverified']),
});

/** A region's verdict: read (both sides have enough pixels) within its bar or outside it, or unverified. */
const RegionVerdict = Schema.Literals(['within', 'outside', 'unverified']);

/** A speck read: the share of the pixels that are specks, and the pixels read. */
const SpeckRead = Schema.Struct({ share: Schema.Finite, px: Schema.Int });

/** A line where the paint of `part` meets the paint of `meets` (four ways, both lighter than the ink in the answer): the mean L* step across it, `part` less `meets`, of the laid paint and of the answer at the same pixels, and how many pairs it was read on. */
export const PartStep = Schema.Struct({
  part: Schema.String,
  meets: Schema.String,
  laid: Schema.Finite,
  answer: Schema.Finite,
  pairs: Schema.Int,
  verdict: RegionVerdict,
});

/** One painted region's specks (the paint of `part` under the moving part `under`) against its part's kept cloth within 24 px of it. */
export const RegionSpeck = Schema.Struct({
  part: Schema.String,
  under: Schema.String,
  painted: SpeckRead,
  kept: SpeckRead,
  verdict: RegionVerdict,
});

/** A chroma read: the CIELAB chroma of the mean a*, b*, and the pixels read. */
const ChromaRead = Schema.Struct({ chroma: Schema.Finite, px: Schema.Int });

/** One painted region's chroma (the paint of `part` under the moving part `under`) against its part's kept cloth within 6 px of each painted pixel: the read cell whose paint is greyest against its cloth, and how many cells were read (0, unread: chroma and px 0). */
export const RegionChroma = Schema.Struct({
  part: Schema.String,
  under: Schema.String,
  painted: ChromaRead,
  kept: ChromaRead,
  cells: Schema.Int,
  verdict: RegionVerdict,
});

/** A part sheet's hidden paint, measured against its view. */
export const HiddenMeasures = Schema.Struct({
  /** Mean ΔE76 of each painted pixel against the pixels its part keeps beside it (four ways, both paint); null with fewer pairs than the bar reads. */
  seam: Schema.Struct({ deltaE: Schema.OptionFromNullOr(Schema.Finite), pairs: Schema.Int }),
  /** Mean ΔE76 of the answer laid over the view against the view, over the pixels kept by the parts the hidden areas lie on: fixed by the sheet, whatever the answer paints; and each painted region's chroma against the kept cloth beside it, so paint greyer than its cloth at the cloth's lightness is read. */
  drift: Schema.Struct({
    deltaE: Schema.Finite,
    px: Schema.Int,
    chroma: Schema.Array(RegionChroma),
  }),
  /** Each part the hidden areas lie on: its paint's grain against its kept pixels' within 24 px of the paint. */
  grain: Schema.Array(PartGrain),
  /** Each painted region: its speck share against its part's kept cloth's. */
  speck: Schema.Array(RegionSpeck),
  /** Each line where two parts' paint meets: the laid paint's step across it against the answer's. */
  step: Schema.Array(PartStep),
  /** The painted pixels each moving part hides. */
  paintUnder: Schema.Array(Schema.Struct({ part: Schema.String, px: Schema.Int })),
  paintedPx: Schema.Int,
  /** Painted pixels no opaque part in front hides: 0 by `paintHidden`. */
  visibleAtRest: Schema.Int,
  recomposeByteEqual: Schema.Boolean,
});
export type HiddenMeasures = typeof HiddenMeasures.Type;

/** A grain read, rounded for the record. */
const rounded = (g: { readonly robust: number; readonly plain: number; readonly n: number }) => ({
  robust: round2(g.robust),
  plain: round2(g.plain),
  n: g.n,
});

/** The grain of part `id`'s paint and of its kept paint within reach of it, each over paint lighter than the ink. */
const partGrain = (view: Raster, sheet: Sheet, at: Uint8Array, composite: Raster, id: number) => {
  const { width: w, height: h } = view;
  const paint = Uint8Array.from(at, (k, i) => Number(k === id && lightAt(composite, i)));
  const near = Uint8Array.from(sheet.owner, (o, i) => {
    const [x, y] = [i % w, Math.floor(i / w)];
    const reaches = (a: number, b: number) =>
      x + a >= 0 && y + b >= 0 && x + a < w && y + b < h && at[(y + b) * w + x + a] === id;
    return Number(
      o === id &&
        lightAt(view, i) &&
        GRAIN_STEPS.some((a) => GRAIN_STEPS.some((b) => reaches(a, b))),
    );
  });
  const painted = grainOf(composite, paint);
  const kept = grainOf(view, near);
  const read = painted.n >= LEAST_GRAIN_WINDOWS && kept.n >= LEAST_GRAIN_WINDOWS;
  const within = Math.abs(painted.robust - kept.robust) <= BARS.grainWithin;
  const verdict = Bool.match(read, {
    onTrue: () =>
      Bool.match(within, { onTrue: () => 'within' as const, onFalse: () => 'outside' as const }),
    onFalse: () => 'unverified' as const,
  });
  // the bar is read on the grains as measured; the record keeps them rounded
  return {
    part: sheet.parts[id - 1]?.name ?? '',
    painted: rounded(painted),
    kept: rounded(kept),
    verdict,
  };
};

/** `mask` grown by `r` pixels each way (a square reach), in two passes. */
const grown = (mask: Uint8Array, w: number, h: number, r: number): Uint8Array => {
  const pass = (
    src: Uint8Array,
    along: number,
    across: number,
    at: (a: number, b: number) => number,
  ) => {
    const out = new Uint8Array(w * h);
    for (let b = 0; b < across; b++) {
      let count = 0;
      for (let a = 0; a < Math.min(r, along); a++) count += src[at(a, b)] ?? 0;
      for (let a = 0; a < along; a++) {
        // a step past either end of the line adds nothing
        count += Number(a + r < along) * (src[at(a + r, b)] ?? 0);
        count -= Number(a - r - 1 >= 0) * (src[at(a - r - 1, b)] ?? 0);
        out[at(a, b)] = Number(count > 0);
      }
    }
    return out;
  };
  const rows = pass(mask, w, h, (x, y) => y * w + x);
  return pass(rows, h, w, (y, x) => y * w + x);
};

/** Whether pixel `i` of `set` lies on its edge ring: a neighbour of the eight is outside `set` or the picture. */
const onRing = (set: Uint8Array, i: number, w: number, h: number) => {
  const [x, y] = [i % w, Math.floor(i / w)];
  if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return true;
  for (let b = y - 1; b <= y + 1; b++)
    for (let a = x - 1; a <= x + 1; a++) if (set[b * w + a] !== 1) return true;
  return false;
};

/** How long `count` pixels at `sx … sxy` (sums of x, y, x², y², xy) are against their width: the root of their second moments' ratio, each pixel a unit square. */
const elongationOf = (count: number, [sx, sy, sxx, syy, sxy]: ReadonlyArray<number>) => {
  const [mx, my] = [(sx ?? 0) / count, (sy ?? 0) / count];
  const cxx = (sxx ?? 0) / count - mx * mx + 1 / 12;
  const cyy = (syy ?? 0) / count - my * my + 1 / 12;
  const cxy = (sxy ?? 0) / count - mx * my;
  const spread = Math.sqrt((cxx - cyy) ** 2 / 4 + cxy * cxy);
  // each axis's 1/12 keeps the narrower moment at 1/12 or more, so the ratio is finite
  return Math.sqrt(((cxx + cyy) / 2 + spread) / ((cxx + cyy) / 2 - spread));
};

/**
 * The share of `set`'s pixels off its edge ring whose L* lies more than
 * `SPECK_L` from the median L* of their 5 × 5 neighbours in `set`, read on
 * `r`, and how many were read. The ring is the outline where the set meets
 * another part, so it serves as neighbours but is not read; specks that join
 * (eight ways) into a line of `SPECK_LINE_PX` or more, `SPECK_LINE_LONG`
 * times as long as it is wide, are an outline drawn in the paint, not
 * speckle.
 */
const speckShare = (r: Raster, set: Uint8Array) => {
  const { width: w, height: h } = r;
  const at = Arr.range(0, w * h - 1).filter((i) => set[i] === 1 && !onRing(set, i, w, h));
  const l = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) if (set[i] === 1) l[i] = labOf(rgbAt(r, i))[0];
  const speck = new Uint8Array(w * h);
  for (const i of at) {
    const [x, y] = [i % w, Math.floor(i / w)];
    const around: number[] = [];
    for (let b = Math.max(0, y - 2); b <= Math.min(h - 1, y + 2); b++)
      for (let a = Math.max(0, x - 2); a <= Math.min(w - 1, x + 2); a++)
        if (set[b * w + a] === 1) around.push(l[b * w + a] ?? 0);
    speck[i] = Number(Math.abs((l[i] ?? 0) - medianOf(around)) > SPECK_L);
  }
  const { components, labels } = componentsOf(speck, w, h, true);
  const moments = components.map(() => [0, 0, 0, 0, 0]);
  for (const i of at.filter((i) => speck[i] === 1)) {
    const [x, y] = [i % w, Math.floor(i / w)];
    const step = [x, y, x * x, y * y, x * y];
    Option.map(Option.fromUndefinedOr(moments[labels[i] ?? -1]), (m) => {
      for (let c = 0; c < 5; c++) m[c] = (m[c] ?? 0) + (step[c] ?? 0);
    });
  }
  const specks = components
    .filter(
      (c, k) => c.area < SPECK_LINE_PX || elongationOf(c.area, moments[k] ?? []) < SPECK_LINE_LONG,
    )
    .reduce((n, c) => n + c.area, 0);
  return { share: specks / Math.max(1, at.length), px: at.length };
};

/** Summed-area tables of a*, b* and count over the pixels `set` marks on `r`, and the sums over a box of them. */
const summedAb = (r: Raster, set: Uint8Array) => {
  const { width: w, height: h } = r;
  const s = w + 1;
  const [a, b, n] = [
    new Float64Array(s * (h + 1)),
    new Float64Array(s * (h + 1)),
    new Float64Array(s * (h + 1)),
  ];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const on = Number(set[i] === 1);
      const lab = labOf(rgbAt(r, i));
      const j = (y + 1) * s + x + 1;
      a[j] = on * lab[1] + (a[j - 1] ?? 0) + (a[j - s] ?? 0) - (a[j - s - 1] ?? 0);
      b[j] = on * lab[2] + (b[j - 1] ?? 0) + (b[j - s] ?? 0) - (b[j - s - 1] ?? 0);
      n[j] = on + (n[j - 1] ?? 0) + (n[j - s] ?? 0) - (n[j - s - 1] ?? 0);
    }
  const sum = (t: Float64Array, x0: number, y0: number, x1: number, y1: number) =>
    (t[y1 * s + x1] ?? 0) - (t[y0 * s + x1] ?? 0) - (t[y1 * s + x0] ?? 0) + (t[y0 * s + x0] ?? 0);
  return (x0: number, y0: number, x1: number, y1: number) => ({
    a: sum(a, x0, y0, x1, y1),
    b: sum(b, x0, y0, x1, y1),
    n: sum(n, x0, y0, x1, y1),
  });
};

/**
 * A region's chroma, read cell by cell (`CHROMA_CELL` px squares). Each
 * painted pixel is held to its own cloth: the mean a*, b* of the kept pixels
 * within `CHROMA_REACH` of it (at least `LEAST_BESIDE_PX`), so a cell where
 * paint meets two cloths weighs each as its paint does. In each cell with
 * `LEAST_CELL_PX` such pixels, the chroma of the paint's mean a*, b* against
 * the chroma of its cloths' mean. The cell whose paint is greyest against
 * its cloth stands for the region, with how many cells were read; none read
 * leaves it unread.
 */
const chromaCells = (composite: Raster, view: Raster, paint: Uint8Array, kept: Uint8Array) => {
  const { width: w, height: h } = view;
  const beside = summedAb(view, kept);
  const cells = new Map<number, { pa: number; pb: number; ka: number; kb: number; px: number }>();
  for (let i = 0; i < w * h; i++) {
    if (paint[i] !== 1) continue;
    const [x, y] = [i % w, Math.floor(i / w)];
    const cloth = beside(
      Math.max(0, x - CHROMA_REACH),
      Math.max(0, y - CHROMA_REACH),
      Math.min(w, x + CHROMA_REACH + 1),
      Math.min(h, y + CHROMA_REACH + 1),
    );
    if (cloth.n < LEAST_BESIDE_PX) continue;
    const key = Math.floor(y / CHROMA_CELL) * w + Math.floor(x / CHROMA_CELL);
    const cell = cells.get(key) ?? { pa: 0, pb: 0, ka: 0, kb: 0, px: 0 };
    cells.set(key, cell);
    const lab = labOf(rgbAt(composite, i));
    cell.pa += lab[1];
    cell.pb += lab[2];
    cell.ka += cloth.a / cloth.n;
    cell.kb += cloth.b / cloth.n;
    cell.px += 1;
  }
  const read = [...cells.values()]
    .filter((c) => c.px >= LEAST_CELL_PX)
    .map((c) => ({
      painted: { chroma: Math.hypot(c.pa / c.px, c.pb / c.px), px: c.px },
      kept: { chroma: Math.hypot(c.ka / c.px, c.kb / c.px), px: c.px },
    }));
  const drop = (c: (typeof read)[number]) => c.kept.chroma - c.painted.chroma;
  return { greyest: Arr.head([...read].sort((x, y) => drop(y) - drop(x))), cells: read.length };
};

/** A region's verdict: unverified when it was not read, else within its bar or outside it. */
const verdictOf = (read: boolean, within: boolean) =>
  Bool.match(read, {
    onTrue: () =>
      Bool.match(within, { onTrue: () => 'within' as const, onFalse: () => 'outside' as const }),
    onFalse: () => 'unverified' as const,
  });

/**
 * Each painted region (the paint of one part under one moving part), its
 * specks and its chroma, each against its part's kept cloth beside it. A
 * speck is a pixel set apart in lightness from its own kind around it, ink
 * included: a fleck of another part's colour in the paint. The chroma is
 * read on paint and cloth lighter than the ink.
 */
const regionsOf = (view: Raster, sheet: Sheet, at: Uint8Array, composite: Raster) => {
  const { width: w, height: h } = view;
  const name = (id: number) => sheet.parts[id - 1]?.name ?? '';
  const keys = [
    ...new Set(
      Arr.range(0, w * h - 1)
        .filter((i) => (at[i] ?? 0) > 0)
        .map((i) => `${at[i]}/${sheet.owner[i]}`),
    ),
  ].sort();
  const regions = keys.map((key) => {
    const [id = 0, under = 0] = key.split('/').map(Number);
    const mine = Uint8Array.from(at, (k, i) => Number(k === id && sheet.owner[i] === under));
    const near = grown(mine, w, h, SPECK_REACH);
    const speckPainted = speckShare(composite, mine);
    const speckKept = speckShare(
      view,
      Uint8Array.from(sheet.owner, (o, i) => Number(o === id && near[i] === 1)),
    );
    const chroma = chromaCells(
      composite,
      view,
      Uint8Array.from(mine, (m, i) => Number(m === 1 && lightAt(composite, i))),
      Uint8Array.from(sheet.owner, (o, i) => Number(o === id && lightAt(view, i))),
    );
    const unread = { chroma: 0, px: 0 };
    const [chromaPainted, chromaKept] = Option.match(chroma.greyest, {
      onNone: () => [unread, unread] as const,
      onSome: (c) => [c.painted, c.kept] as const,
    });
    const region = { part: name(id), under: name(under) };
    // each bar is read on the measures as taken; the record keeps them rounded
    return {
      speck: {
        ...region,
        painted: { share: round3(speckPainted.share), px: speckPainted.px },
        kept: { share: round3(speckKept.share), px: speckKept.px },
        verdict: verdictOf(
          speckPainted.px >= LEAST_REGION_PX && speckKept.px >= LEAST_REGION_PX,
          speckPainted.share - speckKept.share <= BARS.speckOver,
        ),
      },
      chroma: {
        ...region,
        painted: { chroma: round2(chromaPainted.chroma), px: chromaPainted.px },
        kept: { chroma: round2(chromaKept.chroma), px: chromaKept.px },
        cells: chroma.cells,
        verdict: verdictOf(
          chroma.cells > 0,
          chromaKept.chroma - chromaPainted.chroma <= BARS.chromaDrop,
        ),
      },
    };
  });
  return { speck: regions.map((r) => r.speck), chroma: regions.map((r) => r.chroma) };
};

/**
 * Each line where two parts' paint meets (four ways, both lighter than the
 * ink in the answer `laid`): the mean L* step across it of the laid paint
 * (`composite`) and of the answer at the same pixels. The lay tones each
 * part's paint on its own, so a step the answer does not paint is the lay's.
 */
const stepsAcross = (sheet: Sheet, at: Uint8Array, composite: Raster, laid: Raster) => {
  const { width: w, height: h } = composite;
  const name = (id: number) => sheet.parts[id - 1]?.name ?? '';
  const lightness = (r: Raster, i: number) => labOf(rgbAt(r, i))[0];
  const lines = new Map<
    string,
    { a: number; b: number; laid: number; answer: number; pairs: number }
  >();
  for (let i = 0; i < w * h; i++) {
    const ahead = [
      [i % w < w - 1, i + 1],
      [Math.floor(i / w) < h - 1, i + w],
    ] as const;
    for (const [inside, j] of ahead) {
      const [ki, kj] = [at[i] ?? 0, at[j] ?? 0];
      if (!inside || ki === 0 || kj === 0 || ki === kj) continue;
      if (!lightAt(laid, i) || !lightAt(laid, j)) continue;
      const [p, q] = (ki < kj && [i, j]) || [j, i];
      const [a, b] = [Math.min(ki, kj), Math.max(ki, kj)];
      const line = lines.get(`${a}/${b}`) ?? { a, b, laid: 0, answer: 0, pairs: 0 };
      lines.set(`${a}/${b}`, line);
      line.laid += lightness(composite, p) - lightness(composite, q);
      line.answer += lightness(laid, p) - lightness(laid, q);
      line.pairs += 1;
    }
  }
  return [...lines.values()]
    .sort((x, y) => x.a - y.a || x.b - y.b)
    .map((l) => ({
      part: name(l.a),
      meets: name(l.b),
      laid: round2(l.laid / l.pairs),
      answer: round2(l.answer / l.pairs),
      pairs: l.pairs,
      verdict: verdictOf(
        l.pairs >= LEAST_STEP_PAIRS,
        Math.abs(l.laid - l.answer) / l.pairs <= BARS.stepWithin,
      ),
    }));
};

/** Each painted pixel's part (k + 1, 0 for none), the seam pairs, and the painted pixels no opaque part in front hides. */
const paintOf = (view: Raster, sheet: Sheet) => {
  const { width: w, height: h } = view;
  const at = new Uint8Array(w * h);
  const seam: number[] = [];
  let visible = 0;
  sheet.parts.forEach((p, k) => {
    for (let i = 0; i < w * h; i++) {
      if (sheet.owner[i] === k + 1 || p.pixels.rgba[i * 4 + 3] === 0) continue;
      at[i] = k + 1;
      const o = sheet.owner[i] ?? 0;
      const front = Number(o >= 1 && o <= k) * (sheet.parts[o - 1]?.pixels.rgba[i * 4 + 3] ?? 0);
      visible += Number(front !== 255);
      const paint = labOf(rgbAt(p.pixels, i));
      for (const j of neighbours(i, w, h).filter(
        (j) => sheet.owner[j] === k + 1 && lightAt(view, j),
      ))
        if (paint[0] > INK_L) seam.push(deltaE(paint, labOf(rgbAt(view, j))));
    }
  });
  return { at, seam, visible };
};

/** The pixels the sheet fixes for a view's measures, before any answer: the hidden areas' parts behind, and the pixels those parts keep. */
export const domainOf = (sheet: Sheet, hidden: Uint8Array) => {
  const behind = behindOf(sheet, hidden);
  const ids = [...new Set(behind.filter((b) => b > 0))].sort((a, b) => a - b);
  const kept = Uint8Array.from(sheet.owner, (o) => Number(ids.includes(o)));
  return { behind, ids, kept };
};

/** The hidden paint of `sheet` (laid from `laid`, the answer over the view) measured against `view` on the domain the sheet fixes. */
const measureHidden = (
  view: Raster,
  sheet: Sheet,
  domain: ReturnType<typeof domainOf>,
  moving: ReadonlyArray<string>,
  laid: Raster,
): HiddenMeasures => {
  const n = view.width * view.height;
  const { at, seam, visible } = paintOf(view, sheet);
  const rgba = Uint8Array.from(view.rgba);
  at.forEach((k, i) => {
    if (k > 0)
      rgba.set(sheet.parts[k - 1]?.pixels.rgba.subarray(i * 4, i * 4 + 4) ?? MAGENTA, i * 4);
  });
  const composite = { width: view.width, height: view.height, rgba };
  const drift = Arr.range(0, n - 1)
    .filter((i) => domain.kept[i] === 1)
    .map((i) => deltaE(labOf(rgbAt(laid, i)), labOf(rgbAt(view, i))));
  const ids = sheet.parts.map((_, k) => k + 1);
  const regions = regionsOf(view, sheet, at, composite);
  return {
    seam: {
      deltaE: Option.liftPredicate(round2(meanOf(seam)), () => seam.length >= LEAST_SEAM_PAIRS),
      pairs: seam.length,
    },
    drift: { deltaE: round2(meanOf(drift)), px: drift.length, chroma: regions.chroma },
    grain: domain.ids.map((id) => partGrain(view, sheet, at, composite, id)),
    speck: regions.speck,
    step: stepsAcross(sheet, at, composite, laid),
    paintUnder: moving.map((part) => {
      const id = ids.find((k) => sheet.parts[k - 1]?.name === part) ?? 0;
      return { part, px: at.filter((k, i) => k > 0 && sheet.owner[i] === id).length };
    }),
    paintedPx: at.filter((k) => k > 0).length,
    visibleAtRest: visible,
    recomposeByteEqual: recompose(sheet, view).rgba.every((v, i) => v === view.rgba[i]),
  };
};

/**
 * The bars a measure misses, by name: paint (a moving part hides none),
 * seam (above its bar, or too few pairs to read), drift (above its bar, no
 * pixel to read it on, or a region's chroma outside its bar or with no cell
 * to read it on), grain (a read part outside its bar, or no part read),
 * speck (a region's speck share outside its bar, or too few pixels to read
 * it on), step (a line where two parts' paint meets stepping outside its
 * bar, or too few pairs to read it on), paint visible at rest, the view not
 * recomposed.
 */
export const missedBars = (m: HiddenMeasures): ReadonlyArray<string> =>
  Arr.filter(
    [
      ['paint', m.paintUnder.length > 0 && m.paintUnder.every((p) => p.px > 0)],
      ['seam', Option.exists(m.seam.deltaE, (d) => d <= BARS.seamDeltaE)],
      [
        'drift',
        m.drift.px > 0 &&
          m.drift.deltaE <= BARS.driftDeltaE &&
          m.drift.chroma.every((c) => c.verdict === 'within'),
      ],
      [
        'grain',
        m.grain.some((g) => g.verdict === 'within') &&
          m.grain.every((g) => g.verdict !== 'outside'),
      ],
      ['speck', m.speck.every((s) => s.verdict === 'within')],
      ['step', m.step.every((s) => s.verdict === 'within')],
      ['visible', m.visibleAtRest === BARS.visibleAtRest],
      ['recompose', m.recomposeByteEqual],
    ] as const,
    ([, met]) => !met,
  ).map(([name]) => name);

/** How an answer ranks, lower first: one that leaves a moving part unpainted after every one that paints them all, then by bars missed, then by seam. */
export const rankOf = (m: HiddenMeasures): readonly [number, number, number] => {
  const missed = missedBars(m);
  return [
    Number(missed.includes('paint')),
    missed.length,
    Option.getOrElse(m.seam.deltaE, () => Number.POSITIVE_INFINITY),
  ];
};

/** The parts laid side by side over `ground`, a view's width each; with `tint`, each painted pixel half magenta. */
export const sheetStrip = (sheet: Sheet, ground: Rgb, tint: boolean): Raster => {
  const { width: w, height: h } = sheet;
  const width = w * sheet.parts.length;
  const rgba = new Uint8Array(width * h * 4);
  sheet.parts.forEach((p, k) => {
    for (let i = 0; i < w * h; i++) {
      const o = (Math.floor(i / w) * width + k * w + (i % w)) * 4;
      const a = (p.pixels.rgba[i * 4 + 3] ?? 0) / 255;
      // a painted pixel shows half magenta on the tint
      const half = Number(tint && a > 0 && sheet.owner[i] !== k + 1) / 2;
      for (let c = 0; c < 3; c++) {
        const own = (p.pixels.rgba[i * 4 + c] ?? 0) * a + (ground[c] ?? 0) * (1 - a);
        rgba[o + c] = Math.round(own * (1 - half) + (MAGENTA[c] ?? 0) * half);
      }
      rgba[o + 3] = 255;
    }
  });
  return { width, height: h, rgba };
};

/** What one answer is laid on: the view, its sheet, its hidden pixels and their domain, its moving parts, the padding's move and the portrait it was asked at. */
interface LayTarget {
  readonly view: Raster;
  readonly sheet: Sheet;
  readonly hidden: Uint8Array;
  readonly domain: ReturnType<typeof domainOf>;
  readonly moving: ReadonlyArray<string>;
  readonly pad: { readonly s: number; readonly dx: number; readonly dy: number };
  readonly portrait: { readonly width: number; readonly height: number };
}

/** One answer laid on the view: fitted from the padding's own move, painted, measured; or why its paint cannot be laid. */
export const layAnswer = (target: LayTarget, answer: Raster) => {
  const { view, sheet, hidden, domain, pad, portrait } = target;
  // the answer is registered where it should still show the view: every other pixel of the figure no moving part owns
  const where = Uint8Array.from(sheet.owner, (o, i) =>
    Number(o > 0 && hidden[i] === 0 && i % 2 === 0),
  );
  // the answer drawn at another size than the portrait it was asked at
  const k = (portrait.width / answer.width + portrait.height / answer.height) / 2;
  const fit = fitSimilarity(view, answer, where, { s: pad.s * k, dx: pad.dx, dy: pad.dy });
  const laid = drawSimilar(answer, view.width, view.height, fit);
  // the paint takes one answer pixel each, so okra's grain is not averaged away; the drift reads the footprint mean
  const point = drawPoint(answer, view.width, view.height, fit);
  const painted = paintedOf(sheet, hidden, point);
  return Result.map(layHidden(view, sheet, domain.behind, painted, point), (made) => ({
    fit,
    made,
    measures: measureHidden(view, made, domain, target.moving, laid),
  }));
};
