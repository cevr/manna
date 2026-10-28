// `film concept parts <film> <member> --view <kind>-<view> [--dry-run]
// [--reuse] [--check]`: a kept view's part sheet, its hidden areas painted.
// The view is cut by the member's cut table (`<member>/cutout/cut.ts`:
// `CUTS`, `cutOptionsFor`, `HIDDEN`; `core/part-sheet.ts`). Every moving
// part's area is painted flat magenta on the whole view, padded to the image
// route's portrait, and okra repaints the magenta alone on its Codex route
// (the subscription; never `--model`, the paid API). The answer is laid back
// over the view by one similarity fitted on colour where it still shows the
// view (`core/register.ts`). Its paint is the answer less the paper the
// view's own ground reaches; each painted pixel goes under the nearest part
// that does not move, in that part's tone, and only through `paintHidden`,
// so paint never shows at rest. Each answer is measured (its seam against
// the part's own pixels beside it, its drift where the sheet shows the
// body, its paint's grain against the part's) and the one missing the
// fewest bars is kept: the part PNGs, the sheet laid out and its tint of
// the painted pixels, and `record.json`, under `<member>/cutout/sheets/<view>/`;
// each call's input (named by its bytes' hash), the prompt and the answers
// under its `okra/`. An answer drawn from another input is stale: kept in
// the record, never laid. A view takes at most three calls. `--reuse` lays
// the answers already drawn; `--check` lays them, writes nothing and fails
// where a file differs; `--dry-run` writes the magenta input under
// `out/<film>/cast/<member>/parts/<view>/`. None of the three calls okra.

import * as Argument from 'effect/cli/Argument';
import * as Command from 'effect/cli/Command';
import * as Flag from 'effect/cli/Flag';
import {
  Array as Arr,
  Boolean as Bool,
  Clock,
  Console,
  Effect,
  FileSystem,
  Option,
  Path,
  Predicate,
  Result,
  Schema,
} from 'effect';
import { SheetKind } from '../core/cast-sheet.ts';
import { componentsOf, deltaE, labOf, rgbAt } from '../core/cast-sheet-pixels.ts';
import {
  type PartCut,
  type PartCutOptions,
  cutParts,
  paintHidden,
  recompose,
} from '../core/part-sheet.ts';
import type { Raster } from '../core/raster.ts';
import { drawSimilar, fitSimilarity, padInto } from '../core/register.ts';
import { castFolder } from './cast-library.ts';
import { sha256Hex } from './digest.ts';
import { FilmFolder, filmNamed, importFilmModule } from './film-repo.ts';
import { ImageRoute, PORTRAIT, editRequest, okraCommand } from './image-route.ts';
import { decodePng, encodePng } from './png.ts';

/** A view's part sheet, as `cutParts` gives it. */
type Sheet = ReturnType<typeof cutParts> extends Result.Result<infer A, unknown> ? A : never;

type Rgb = readonly [number, number, number];

/** A part sheet that cannot be made: the member's cut table, the view, the cut, the paint or the calls. */
class PartsUnmade extends Schema.TaggedError<PartsUnmade>()('PartsUnmade', {
  view: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `the part sheet of ${this.view} cannot be made: ${this.reason}`;
  }
}

/** The most okra calls one view takes. */
const MOST_CALLS = 3;

/** The flat colour the moving parts' areas are painted for okra. */
const MAGENTA = [255, 0, 255, 255] as const;

/** The least ΔE76 from the answer's ground colour that is not its paper. */
const PAPER_NEAR = 6;

/** How far a kept pixel lies from paint to count in the kept grain, pixels, looked for on a 3 px lattice. */
const GRAIN_STEPS = Arr.range(-8, 8).map((k) => k * 3);

/** Lighter than this L* is paint, not ink, for the seam and the grain. */
const INK_L = 45;

/** A normal spread's std over its median absolute deviation. */
const MAD_STD = 1.4826;

/** The stage's bars: seam ΔE ≤ 10, drift ≤ 5, the paint's grain within ±0.5 of the kept. */
const BARS = { seamDeltaE: 10, driftDeltaE: 5, grainWithin: 0.5, visibleAtRest: 0 } as const;

/** Whether pixel `i` of `r` is paint, lighter than the ink. */
const lightAt = (r: Raster, i: number) => labOf(rgbAt(r, i))[0] > INK_L;

/** The mean of `v`'s values, 0 for none. */
const meanOf = (v: ReadonlyArray<number>) => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);

/** The median of `v`'s values, 0 for none. */
const medianOf = (v: ReadonlyArray<number>) => [...v].sort((a, b) => a - b)[v.length >> 1] ?? 0;

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Each pixel a moving part owns and is opaque on: what a pose may uncover. */
const hiddenOf = (sheet: Sheet, moving: ReadonlyArray<string>): Uint8Array => {
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
const magentaOf = (view: Raster, hidden: Uint8Array): Raster => {
  const rgba = Uint8Array.from(view.rgba);
  hidden.forEach((m, i) => m === 1 && rgba.set(MAGENTA, i * 4));
  return { width: view.width, height: view.height, rgba };
};

/** The median colour of `r` over the pixels `at` lists. */
const medianOver = (r: Raster, at: ReadonlyArray<number>): Rgb => {
  const median = (c: number) => medianOf(at.map((i) => r.rgba[i * 4 + c] ?? 0));
  return [median(0), median(1), median(2)];
};

/** A picture's border pixels. */
const borderOf = (w: number, h: number): ReadonlyArray<number> => [
  ...Arr.range(0, w - 1).flatMap((x) => [x, (h - 1) * w + x]),
  ...Arr.range(1, Math.max(1, h - 2)).flatMap((y) => [y * w, y * w + w - 1]),
];

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
  hidden: Uint8Array,
  painted: Uint8Array,
  laid: Raster,
) => {
  const behind = behindOf(sheet, hidden);
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

/** G less its 5 × 5 mean at (`x`, `y`), when the whole 5 × 5 is marked in `at` and is paint. */
const highPassAt = (r: Raster, at: Uint8Array, light: Uint8Array, x: number, y: number) => {
  const w = r.width;
  const window = Arr.range(-2, 2).flatMap((dy) =>
    Arr.range(-2, 2).map((dx) => (y + dy) * w + x + dx),
  );
  return Option.liftPredicate(window, (ws) => ws.every((j) => at[j] === 1 && light[j] === 1)).pipe(
    Option.map(
      (ws) => (r.rgba[(y * w + x) * 4 + 1] ?? 0) - meanOf(ws.map((j) => r.rgba[j * 4 + 1] ?? 0)),
    ),
  );
};

/**
 * The paper's grain: G less its 5 × 5 mean, over the pixels `at` marks
 * whose whole 5 × 5 `at` marks and is paint (lighter than the ink); its
 * spread read as a std from the median absolute deviation (× 1.4826), so
 * the few windows that cross an edge between two paints do not count as
 * grain; and how many pixels.
 */
const grainOf = (r: Raster, at: Uint8Array) => {
  const { width: w, height: h } = r;
  const light = Uint8Array.from({ length: w * h }, (_, i) => Number(lightAt(r, i)));
  const vals = Arr.range(2, h - 3).flatMap((y) =>
    Arr.range(2, w - 3)
      .filter((x) => at[y * w + x] === 1)
      .flatMap((x) => Option.toArray(highPassAt(r, at, light, x, y))),
  );
  const mid = medianOf(vals);
  return { std: MAD_STD * medianOf(vals.map((v) => Math.abs(v - mid))), n: vals.length };
};

/** A part sheet's hidden paint, measured against its view. */
const HiddenMeasures = Schema.Struct({
  /** Mean ΔE76 of each painted pixel against the pixels its part keeps beside it (four ways, both paint). */
  seamDeltaE: Schema.Finite,
  seamPairs: Schema.Int,
  /** Mean ΔE76 of the answer laid over the view against the view, over the pixels the parts that took paint keep. */
  driftDeltaE: Schema.Finite,
  /** The paint's grain, and the grain of its parts' kept pixels within 24 px of it. */
  grain: Schema.Struct({ painted: Schema.Finite, kept: Schema.Finite, paintedPx: Schema.Int }),
  paintedPx: Schema.Int,
  /** Painted pixels no opaque part in front hides: 0 by `paintHidden`. */
  visibleAtRest: Schema.Int,
  recomposeByteEqual: Schema.Boolean,
});
type HiddenMeasures = typeof HiddenMeasures.Type;

/** Each painted pixel's part (k + 1, 0 for none), and the seam: each painted pixel against its part's kept pixels beside it, both paint; with the painted pixels no opaque part in front hides. */
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

/** The pixels the parts that took paint keep within reach of their own paint. */
const keptNearPaint = (sheet: Sheet, at: Uint8Array) => {
  const { width: w, height: h } = sheet;
  const took = new Set(at.filter((k) => k > 0));
  return Uint8Array.from(sheet.owner, (o, i) => {
    const [x, y] = [i % w, Math.floor(i / w)];
    const reaches = (a: number, b: number) =>
      x + a >= 0 && y + b >= 0 && x + a < w && y + b < h && at[(y + b) * w + x + a] === o;
    return Number(took.has(o) && GRAIN_STEPS.some((a) => GRAIN_STEPS.some((b) => reaches(a, b))));
  });
};

/** The hidden paint of `sheet` (laid from `laid`, the answer over the view) measured against `view`. */
const measureHidden = (view: Raster, sheet: Sheet, laid: Raster): HiddenMeasures => {
  const n = view.width * view.height;
  const { at, seam, visible } = paintOf(view, sheet);
  const painted = Uint8Array.from(at, (k) => Number(k > 0));
  const rgba = Uint8Array.from(view.rgba);
  at.forEach((k, i) => {
    if (k > 0)
      rgba.set(sheet.parts[k - 1]?.pixels.rgba.subarray(i * 4, i * 4 + 4) ?? MAGENTA, i * 4);
  });
  const gPaint = grainOf({ width: view.width, height: view.height, rgba }, painted);
  const gKept = grainOf(view, keptNearPaint(sheet, at));
  const took = new Set(at.filter((k) => k > 0));
  const drift = Arr.range(0, n - 1)
    .filter((i) => took.has(sheet.owner[i] ?? 0))
    .map((i) => deltaE(labOf(rgbAt(laid, i)), labOf(rgbAt(view, i))));
  return {
    seamDeltaE: round2(meanOf(seam)),
    seamPairs: seam.length,
    driftDeltaE: round2(meanOf(drift)),
    grain: { painted: round2(gPaint.std), kept: round2(gKept.std), paintedPx: gPaint.n },
    paintedPx: painted.reduce((a, b) => a + b, 0),
    visibleAtRest: visible,
    recomposeByteEqual: recompose(sheet, view).rgba.every((v, i) => v === view.rgba[i]),
  };
};

/** The bars a measure misses, by name: seam, drift, grain, paint visible at rest, the view not recomposed. */
const missedBars = (m: HiddenMeasures): ReadonlyArray<string> =>
  Arr.filter(
    [
      ['seam', m.seamDeltaE <= BARS.seamDeltaE],
      ['drift', m.driftDeltaE <= BARS.driftDeltaE],
      ['grain', Math.abs(m.grain.painted - m.grain.kept) <= BARS.grainWithin],
      ['visible', m.visibleAtRest === BARS.visibleAtRest],
      ['recompose', m.recomposeByteEqual],
    ] as const,
    ([, met]) => !met,
  ).map(([name]) => name);

/** The parts laid side by side over `ground`, a view's width each; with `tint`, each painted pixel half magenta. */
const sheetStrip = (sheet: Sheet, ground: Rgb, tint: boolean): Raster => {
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

/** What a member's cut table exports: its cuts, each view's options, each view's moving parts and okra's words. */
interface CutModule {
  readonly CUTS: Readonly<Record<string, PartCut>>;
  readonly cutOptionsFor: (view: string, raster: Raster) => PartCutOptions;
  readonly HIDDEN: Readonly<
    Record<string, { readonly moving: ReadonlyArray<string>; readonly prompt: string }>
  >;
}

const isCutModule = (u: unknown): u is CutModule =>
  Predicate.isObject(u) &&
  Predicate.hasProperty(u, 'CUTS') &&
  Predicate.hasProperty(u, 'HIDDEN') &&
  Predicate.hasProperty(u, 'cutOptionsFor') &&
  Predicate.isFunction(u.cutOptionsFor);

const Similarity = Schema.Struct({ s: Schema.Finite, dx: Schema.Finite, dy: Schema.Finite });

/** One call of a view, as its record keeps it: its number, its command line and its input and answer (paths from the sheet's folder; the input named by its bytes' hash). */
const CallRecord = Schema.Struct({
  n: Schema.Int,
  command: Schema.Array(Schema.String),
  input: Schema.String,
  out: Schema.String,
});
type CallRecord = typeof CallRecord.Type;

/** A call as the record keeps it after a lay: stale (drawn from another input), or laid, its fit and measures with it. */
const CallLaid = Schema.Struct({
  ...CallRecord.fields,
  stale: Schema.Boolean,
  fit: Schema.optional(Schema.Struct({ ...Similarity.fields, score: Schema.Finite })),
  measures: Schema.optional(HiddenMeasures),
  missed: Schema.optional(Schema.Array(Schema.String)),
});

/** A view's part sheet record: its parts, its moving parts, its okra calls and the answer kept, its measures and bars. */
const PartSheetRecord = Schema.Struct({
  view: Schema.String,
  kind: Schema.String,
  size: Schema.Array(Schema.Int),
  command: Schema.String,
  parts: Schema.Array(
    Schema.Struct({ name: Schema.String, kept: Schema.Int, painted: Schema.Int }),
  ),
  moving: Schema.Array(Schema.String),
  hiddenPx: Schema.Int,
  /** Areas painted by the sheet's own rows carried under, not okra: none. */
  carried: Schema.Array(Schema.String),
  okra: Schema.Struct({
    route: Schema.String,
    input: Schema.String,
    prompt: Schema.String,
    pad: Similarity,
    calls: Schema.Array(CallLaid),
    chosen: Schema.Int,
    fit: Schema.Struct({ ...Similarity.fields, score: Schema.Finite }),
  }),
  measures: HiddenMeasures,
  bars: Schema.Struct({
    seamDeltaE: Schema.Finite,
    driftDeltaE: Schema.Finite,
    grainWithin: Schema.Finite,
    visibleAtRest: Schema.Int,
  }),
  missed: Schema.Array(Schema.String),
});
const PartSheetRecordJson = Schema.fromJsonString(PartSheetRecord, { space: 2 });

/** The calls a record already holds. */
const PriorRecordJson = Schema.fromJsonString(
  Schema.Struct({ okra: Schema.Struct({ calls: Schema.Array(CallRecord) }) }),
);

/** `<kind>-<view>` read: the kind, and the view's name in the member's views. */
const viewOf = (asked: string) =>
  Arr.findFirst(SheetKind.literals, (k) => asked.startsWith(`${k}-`)).pipe(
    Result.fromOption(() =>
      PartsUnmade.make({
        view: asked,
        reason: 'a view is <kind>-<view>, its kind turnaround, poses or heads',
      }),
    ),
    Result.map((kind) => ({ kind, name: asked.slice(kind.length + 1) })),
  );

/** A PNG read, or why not. */
const pngAt = (file: string, refuse: (reason: string) => PartsUnmade) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const bytes = yield* fs.readFile(file).pipe(Effect.mapError((e) => refuse(e.message)));
    return yield* Effect.fromResult(Result.mapError(decodePng(bytes), (e) => refuse(e.message)));
  });

/** The member's cut table, its view's cut and its moving parts and prompt, or why not. */
const cutTableOf = (file: string, name: string, refuse: (reason: string) => PartsUnmade) =>
  Effect.gen(function* () {
    const loaded: unknown = yield* Effect.tryPromise({
      try: () => importFilmModule(file),
      catch: (e) => refuse(`${file} does not load: ${String(e)}`),
    });
    if (!isCutModule(loaded))
      return yield* refuse(`${file} exports no CUTS, cutOptionsFor and HIDDEN`);
    const found = Option.all([
      Option.fromUndefinedOr(loaded.CUTS[name]),
      Option.fromUndefinedOr(loaded.HIDDEN[name]),
    ]);
    return yield* Option.match(found, {
      onNone: () => refuse(`the cut table has no cut and HIDDEN entry for ${name}`),
      onSome: ([cut, hidden]) => Effect.succeed({ cut, hidden, optionsFor: loaded.cutOptionsFor }),
    });
  });

/** One answer laid on the view: fitted from the padding's own move, painted, measured. */
const layAnswer = (
  view: Raster,
  sheet: Sheet,
  hidden: Uint8Array,
  answer: Raster,
  pad: { readonly s: number; readonly dx: number; readonly dy: number },
  refuse: (reason: string) => PartsUnmade,
) => {
  // the answer is registered where it should still show the view: every other pixel of the figure no moving part owns
  const where = Uint8Array.from(sheet.owner, (o, i) =>
    Number(o > 0 && hidden[i] === 0 && i % 2 === 0),
  );
  // the answer drawn at another size than the portrait it was asked at
  const k = (PORTRAIT.width / answer.width + PORTRAIT.height / answer.height) / 2;
  const fit = fitSimilarity(view, answer, where, { s: pad.s * k, dx: pad.dx, dy: pad.dy });
  const laid = drawSimilar(answer, view.width, view.height, fit);
  const painted = paintedOf(sheet, hidden, laid);
  return Result.mapError(layHidden(view, sheet, hidden, painted, laid), (e) =>
    refuse(e.message),
  ).pipe(Result.map((made) => ({ fit, made, measures: measureHidden(view, made, laid) })));
};

export const parts = Command.make(
  'parts',
  {
    film: Argument.String('film').pipe(Argument.withDescription('the film whose cast holds him')),
    member: Argument.String('member').pipe(Argument.withDescription('the cast member, by its id')),
    view: Flag.String('view').pipe(
      Flag.withDescription(
        'the kept view to cut and paint, <kind>-<view> (turnaround-front, heads-heads-4)',
      ),
    ),
    dryRun: Flag.Boolean('dry-run').pipe(
      Flag.withDefault(false),
      Flag.withDescription('write the magenta input under out/ and call nothing'),
    ),
    reuse: Flag.Boolean('reuse').pipe(
      Flag.withDefault(false),
      Flag.withDescription('lay the answers already drawn again, and call nothing'),
    ),
    check: Flag.Boolean('check').pipe(
      Flag.withDefault(false),
      Flag.withDescription(
        'lay the answers already drawn, write nothing, and fail where a file on disk differs from what it lays',
      ),
    ),
  },
  Effect.fn('film.concept.parts')(function* (input) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { name } = yield* Effect.fromResult(viewOf(input.view));
    const refuse = (reason: string) => PartsUnmade.make({ view: input.view, reason });
    const film = yield* filmNamed(input.film);
    const folder = yield* castFolder(film, input.member);
    const memberDir = path.dirname(folder);
    const table = yield* cutTableOf(path.join(memberDir, 'cutout', 'cut.ts'), name, refuse);
    const view = yield* pngAt(path.join(folder, 'views', `${name}.png`), refuse);
    const started = yield* Clock.currentTimeMillis;
    const sheet = yield* Effect.fromResult(
      Result.mapError(cutParts(view, table.cut, table.optionsFor(name, view)), (e) =>
        refuse(e.message),
      ),
    );
    const cutMs = (yield* Clock.currentTimeMillis) - started;
    const hidden = hiddenOf(sheet, table.hidden.moving);
    const ground = medianOver(view, borderOf(view.width, view.height));
    const pad = padInto(magentaOf(view, hidden), PORTRAIT.width, PORTRAIT.height, ground);
    const hiddenPx = hidden.reduce((a, b) => a + b, 0);
    const label = `${input.member}.${input.view}`;
    const inputBytes = encodePng(pad.picture);

    if (input.dryRun) {
      const out = path.join(
        (yield* FilmFolder).paths(film).out,
        'cast',
        input.member,
        'parts',
        name,
      );
      yield* fs.makeDirectory(out, { recursive: true });
      const mask = path.join(out, 'input.png');
      yield* fs.writeFile(mask, inputBytes);
      return yield* Console.log(
        `parts ${label} dry-run parts=${sheet.parts.length} moving=${table.hidden.moving.join(',')} hidden=${hiddenPx}px cut=${cutMs}ms mask=${mask} okra=0`,
      );
    }

    const dir = path.join(memberDir, 'cutout', 'sheets', name);
    // the input named by its bytes, so an answer is laid only on the cut it was drawn for
    const inputName = `okra/input-${sha256Hex(inputBytes).slice(0, 12)}.png`;
    const promptBytes = new TextEncoder().encode(`${table.hidden.prompt}\n`);
    const recordFile = path.join(dir, 'record.json');
    const prior: ReadonlyArray<CallRecord> = yield* Bool.match(yield* fs.exists(recordFile), {
      onTrue: () =>
        fs.readFileString(recordFile).pipe(
          Effect.flatMap(Schema.decodeEffect(PriorRecordJson)),
          Effect.map((r) => r.okra.calls),
          Effect.mapError((e) => refuse(`its record does not read: ${e.message}`)),
        ),
      onFalse: () => Effect.succeed<ReadonlyArray<CallRecord>>([]),
    });
    const relative = (arg: string) => arg.split(`${dir}${path.sep}`).join('');
    const calls: CallRecord[] = [...prior];
    if (!input.reuse && !input.check) {
      if (calls.length >= MOST_CALLS)
        return yield* refuse(
          `it has had ${calls.length} okra calls, the most a view takes; --reuse lays them again`,
        );
      yield* fs.makeDirectory(path.join(dir, 'okra'), { recursive: true });
      yield* fs.writeFile(path.join(dir, inputName), inputBytes);
      const n = calls.length + 1;
      const out = path.join(dir, 'okra', `answer-${n}.png`);
      const request = editRequest(table.hidden.prompt, path.join(dir, inputName), out);
      const command = okraCommand(request).map(relative);
      yield* Console.log(`parts ${label} okra call ${n}: ${command.join(' ')}`);
      yield* (yield* ImageRoute).draw(request).pipe(Effect.mapError((e) => refuse(e.message)));
      calls.push({ n, command, input: inputName, out: relative(out) });
    }
    // an answer drawn from another input (the cut has moved since) is stale: kept in the record, never laid
    const fresh = calls.filter((c) => c.input === inputName);
    if (fresh.length === 0)
      return yield* refuse(
        `no okra answer was drawn from its present input (${calls.length} stale, ${MOST_CALLS - calls.length} calls left); run it without --reuse`,
      );
    const tried = yield* Effect.forEach(fresh, (call) =>
      Effect.gen(function* () {
        const answer = yield* pngAt(path.join(dir, call.out), refuse);
        const laid = yield* Effect.fromResult(
          layAnswer(view, sheet, hidden, answer, pad.fit, refuse),
        );
        const m = laid.measures;
        yield* Console.log(
          `parts ${label} answer ${call.n}: seam=${m.seamDeltaE} drift=${m.driftDeltaE} grain=${m.grain.painted}/${m.grain.kept} painted=${m.paintedPx}px visible=${m.visibleAtRest}`,
        );
        return { call, ...laid };
      }),
    );
    // the answer missing the fewest bars, then with the lowest seam, then the first drawn
    const best = tried.reduce((a, b) => {
      const [ma, mb] = [missedBars(a.measures).length, missedBars(b.measures).length];
      const better = mb < ma || (mb === ma && b.measures.seamDeltaE < a.measures.seamDeltaE);
      return [a, b][Number(better)] ?? a;
    });
    const record: typeof PartSheetRecord.Type = {
      view: name,
      kind: input.view.slice(0, input.view.length - name.length - 1),
      size: [view.width, view.height],
      command: `film concept parts ${input.film} ${input.member} --view ${input.view}`,
      parts: best.made.parts.map((p) => ({ name: p.name, kept: p.kept, painted: p.painted })),
      moving: table.hidden.moving,
      hiddenPx,
      carried: [],
      okra: {
        route: 'subscription (okra image, Codex route; no --model)',
        input: inputName,
        prompt: 'okra/prompt.txt',
        pad: pad.fit,
        calls: calls.map((c) =>
          Option.match(
            Arr.findFirst(tried, (t) => t.call.n === c.n),
            {
              onNone: () => ({ ...c, stale: true }),
              onSome: (t) => ({
                ...c,
                stale: false,
                fit: t.fit,
                measures: t.measures,
                missed: missedBars(t.measures),
              }),
            },
          ),
        ),
        chosen: best.call.n,
        fit: best.fit,
      },
      measures: best.measures,
      bars: BARS,
      missed: missedBars(best.measures),
    };
    const recordText = yield* Schema.encodeEffect(PartSheetRecordJson)(record).pipe(
      Effect.mapError((e) => refuse(e.message)),
    );
    const files: ReadonlyArray<readonly [string, Uint8Array]> = [
      ...best.made.parts.map((p) => [`${p.name}.png`, encodePng(p.pixels)] as const),
      ['sheet.png', encodePng(sheetStrip(best.made, ground, false))],
      ['sheet-painted.png', encodePng(sheetStrip(best.made, ground, true))],
      [inputName, inputBytes],
      ['okra/prompt.txt', promptBytes],
      ['record.json', new TextEncoder().encode(`${recordText}\n`)],
    ];
    if (input.check) {
      const differs = yield* Effect.filter(files, ([file, bytes]) =>
        fs.readFile(path.join(dir, file)).pipe(
          Effect.map((held) => held.length !== bytes.length || held.some((b, i) => b !== bytes[i])),
          Effect.orElseSucceed(() => true),
        ),
      );
      if (differs.length > 0)
        return yield* refuse(`${differs.map(([f]) => f).join(', ')} differ from what it lays`);
      return yield* Console.log(
        `parts ${label} check: ${files.length} files hold, answer ${best.call.n} kept okra=0`,
      );
    }
    for (const [file, bytes] of files) yield* fs.writeFile(path.join(dir, file), bytes);
    yield* Console.log(
      `parts ${label} kept answer ${best.call.n} missed=${record.missed.join(',') || 'none'} parts=${best.made.parts.length} cut=${cutMs}ms dir=${dir} okra=${calls.length - prior.length}`,
    );
  }),
).pipe(
  Command.withDescription(
    "Cut a kept view into its part sheet and paint what its moving parts hide: okra (subscription route) repaints their magenta areas, the answer is laid back by one similarity fitted on colour and laid only under the parts in front, in their tone; the answer missing the fewest bars of at most three is kept with its seam, drift and grain under the member's cutout/sheets/<view>/",
  ),
  Command.provide(ImageRoute.layer),
);
