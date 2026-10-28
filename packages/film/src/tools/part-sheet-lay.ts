// An okra answer laid into a view's part sheet, and measured. The answer is
// laid back over the view by one similarity fitted on colour where it still
// shows the view (`core/register.ts`). Its paint is the answer less the
// paper the view's own ground reaches; each painted pixel goes under the
// nearest part that does not move, in that part's tone, and only through
// `paintHidden`, so paint never shows at rest. The measures are read on
// domains the sheet fixes before any answer is read: the drift over the
// pixels kept by the parts the hidden areas lie on, the seam and each such
// part's grain beside its paint. A measure with too few samples to read is
// a missed bar, not a pass, and every moving part must hide some paint
// (`film concept parts`, `part-sheet-cli.ts`, keeps the best answer).

import { Array as Arr, Boolean as Bool, Option, Result, Schema } from 'effect';
import { componentsOf, deltaE, labOf, rgbAt } from '../core/cast-sheet-pixels.ts';
import { grainOf } from '../core/grain.ts';
import { type cutParts, paintHidden, recompose } from '../core/part-sheet.ts';
import type { Raster } from '../core/raster.ts';
import { drawSimilar, fitSimilarity } from '../core/register.ts';

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

/** The stage's bars: seam ΔE ≤ 10, drift ≤ 5, each read part's paint grain within ±0.5 of its kept grain (robust std), no paint at rest. */
export const BARS = {
  seamDeltaE: 10,
  driftDeltaE: 5,
  grainWithin: 0.5,
  visibleAtRest: 0,
  leastSeamPairs: LEAST_SEAM_PAIRS,
  leastGrainWindows: LEAST_GRAIN_WINDOWS,
} as const;

/** Whether pixel `i` of `r` is paint, lighter than the ink. */
const lightAt = (r: Raster, i: number) => labOf(rgbAt(r, i))[0] > INK_L;

/** The mean of `v`'s values, 0 for none. */
const meanOf = (v: ReadonlyArray<number>) => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);

/** The median of `v`'s values, 0 for none. */
const medianOf = (v: ReadonlyArray<number>) => [...v].sort((a, b) => a - b)[v.length >> 1] ?? 0;

const round2 = (v: number) => Math.round(v * 100) / 100;

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
const PartGrain = Schema.Struct({
  part: Schema.String,
  painted: GrainRead,
  kept: GrainRead,
  verdict: Schema.Literals(['within', 'outside', 'unverified']),
});

/** A part sheet's hidden paint, measured against its view. */
export const HiddenMeasures = Schema.Struct({
  /** Mean ΔE76 of each painted pixel against the pixels its part keeps beside it (four ways, both paint); null with fewer pairs than the bar reads. */
  seam: Schema.Struct({ deltaE: Schema.OptionFromNullOr(Schema.Finite), pairs: Schema.Int }),
  /** Mean ΔE76 of the answer laid over the view against the view, over the pixels kept by the parts the hidden areas lie on: fixed by the sheet, whatever the answer paints. */
  drift: Schema.Struct({ deltaE: Schema.Finite, px: Schema.Int }),
  /** Each part the hidden areas lie on: its paint's grain against its kept pixels' within 24 px of the paint. */
  grain: Schema.Array(PartGrain),
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
  return {
    seam: {
      deltaE: Option.liftPredicate(round2(meanOf(seam)), () => seam.length >= LEAST_SEAM_PAIRS),
      pairs: seam.length,
    },
    drift: { deltaE: round2(meanOf(drift)), px: drift.length },
    grain: domain.ids.map((id) => partGrain(view, sheet, at, composite, id)),
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
 * seam (above its bar, or too few pairs to read), drift (above its bar, or
 * no pixel to read it on), grain (a read part outside its bar, or no part
 * read), paint visible at rest, the view not recomposed.
 */
export const missedBars = (m: HiddenMeasures): ReadonlyArray<string> =>
  Arr.filter(
    [
      ['paint', m.paintUnder.length > 0 && m.paintUnder.every((p) => p.px > 0)],
      ['seam', Option.exists(m.seam.deltaE, (d) => d <= BARS.seamDeltaE)],
      ['drift', m.drift.px > 0 && m.drift.deltaE <= BARS.driftDeltaE],
      [
        'grain',
        m.grain.some((g) => g.verdict === 'within') &&
          m.grain.every((g) => g.verdict !== 'outside'),
      ],
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
  const painted = paintedOf(sheet, hidden, laid);
  return Result.map(layHidden(view, sheet, domain.behind, painted, laid), (made) => ({
    fit,
    made,
    measures: measureHidden(view, made, domain, target.moving, laid),
  }));
};
