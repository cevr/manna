// Cuts the woman's head keys (`heads.ts`) from her kept seated sheet: her
// turn (poses-2) and her smile (poses-3), each laid on her poses-1 part
// sheet's frame (`frames.ts`) where its neck lies on the neutral's, and cut
// by her poses-1 cut (`cut.ts`). That cut's head is every row above her chin,
// the veil's top with it, as the feast mother's poses-1 cut keeps her veil's
// top with her head: the veil below the chin stays on her neutral torso. The
// turn and smile paintings draw that veil narrower than the neutral's and
// further to the picture's left, so before the cut each key's drape band,
// from her ear's top down to her chin, is warped across, row by row and each
// side alone (`warped`): the veil's outline moves whole, by a shift that eases
// from none at the band's top to the one that lays it on the neutral's
// outline at the chin row, and the cloth between it and her face stretches or
// narrows to meet the face, which stays as painted. Over the last rows down
// to the chin, everything between the veil's outline and her face line (her
// hair, its shadow, the veil's cloth and folds) fades into the neutral's
// (`faded`): a face line is a drawn line (`LINE`, `LINE_WIDTH`) with her skin
// on its face side. So each key's veil, outline, cloth and hair, runs on into
// her torso's. Each key is written to `sheets/poses-1/head-<key>.png`, the
// view's bytes where the head owns a pixel and alpha 0 elsewhere, as the
// parts CLI writes her head part. Run it from the repo root with
// `bun apps/animations/src/library/cast/feast-guest-woman/cutout/heads-cut.ts`.

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { type Raster, cutParts, decodePng, encodePng } from '@manna/film/tools';
import { Array as Arr, Console, Effect, FileSystem, Option, Record, Result } from 'effect';
import { CUTS, cutOptionsFor } from './cut.ts';
import { boxOf } from './frames.ts';

const here = import.meta.dir;
const KEPT = `${here}/../cast-sheet/kept/poses.png`;

/**
 * Each key's view on her kept sheet: poses-1's part sheet frame moved by
 * `at`, sheet px. Each shift is the one, near the body's best (`[480, 0]`
 * and `[961, 0]`), whose rows below the chin (view rows 260-298, columns
 * 160-225: her neck between the veil's inner edges) best match the
 * neutral's: 11.62 % and 12.59 % of those px step over 30 in a channel,
 * against 22.55 % at `[482, 0]` (measured), so each key's neck runs on into
 * her neutral torso's.
 */
const KEYS = {
  // poses-2: turned to the lead, her mouth open
  turn: [473, -1],
  // poses-3: smiling at the lead, turned as the turn is
  smile: [955, -1],
} as const;

/** A px is ink where its luminance is below this: her outlines, hair and features, none of her cloth or skin. */
const INK = 80;

/** A px may be a drawn line where its luminance is below this. */
const LINE = 40;

/** The fewest px a drawn line spans across a row. */
const LINE_WIDTH = 4;

/** A px is skin where its luminance is this or more: her lit skin (lum 200-221), above her lightest cloth (146). */
const SKIN_LUM = 170;

/** A darker px is skin where its red is this or more and stands `SKIN_WARM` above its green: her shaded neck and ear. */
const SKIN_RED = 150;

/** See `SKIN_RED`: her shaded skin's red stands 50-118 above its green, her cloth's and hair's 6-34. */
const SKIN_WARM = 40;

/** How far past a drawn line's face side its skin may begin: the anti-aliased edge of a line that runs nearly along the row. */
const SKIN_REACH = 10;

/**
 * The drape band's top view row: her ear's top (frame rows 159-160). From
 * here down to the chin each key's veil outlines run beside the neutral's at
 * a steady offset, so the band's shift eases in over the whole free veil.
 */
const BAND_TOP = 160;

/** The rows above the chin whose outline centres fit the line that places each drape outline at the chin. */
const FIT = 12;

/**
 * The rows down to the chin over which each key's drape cloth fades into the
 * neutral's: the paintings shade the cloth apart there (the keys carry a pale
 * band and a darker fold the neutral lacks), a step of about 14 levels of
 * RGB across the chin on the picture's left and 7 on its right against 1 in
 * the neutral painting (measured).
 */
const FADE = 20;

/** The `[x0, y0, x1, y1]` box of `sheet`, its far edges exclusive. */
const cropOf = (
  sheet: Raster,
  [x0, y0, x1, y1]: readonly [number, number, number, number],
): Raster => {
  const [w, h] = [x1 - x0, y1 - y0];
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    rgba.set(
      sheet.rgba.subarray(((y0 + y) * sheet.width + x0) * 4, ((y0 + y) * sheet.width + x1) * 4),
      y * w * 4,
    );
  return { width: w, height: h, rgba };
};

/** The luminance of `r`'s px at `(x, y)`. */
const lumAt = (r: Raster, x: number, y: number) => {
  const i = (y * r.width + x) * 4;
  return 0.299 * (r.rgba[i] ?? 0) + 0.587 * (r.rgba[i + 1] ?? 0) + 0.114 * (r.rgba[i + 2] ?? 0);
};

/** Each side's edges on one row: the drape outline's ink run, and an inner run, `edgesOf`'s or `faceLinesOf`'s. */
interface Edges {
  readonly outlineL: readonly [number, number];
  readonly faceL: readonly [number, number];
  readonly faceR: readonly [number, number];
  readonly outlineR: readonly [number, number];
}

/** Row `y`'s runs of px darker than lum `below` in `r`, each `[first, last]`, left to right. */
const runsOf = (r: Raster, y: number, below: number) => {
  const runs: Array<readonly [number, number]> = [];
  let start = -1;
  for (let x = 0; x <= r.width; x++) {
    const dark = x < r.width && lumAt(r, x, y) < below;
    if (dark && start < 0) start = x;
    if (!dark && start >= 0) {
      runs.push([start, x - 1]);
      start = -1;
    }
  }
  return runs;
};

/** Row `y`'s ink runs in `r`, each `[first, last]`, left to right. */
const inkRuns = (r: Raster, y: number) => runsOf(r, y, INK);

/**
 * Row `y`'s `Edges` in `r`, the warp's: each side's outline and the next ink
 * run in, her hair, ear, cheek, jaw or neck. Fails where the row has fewer
 * than three ink runs, no outline and inner run a side.
 */
const edgesOf = (r: Raster, y: number): Result.Result<Edges, string> => {
  const runs = inkRuns(r, y);
  return Result.fromOption(
    Option.filter(
      Option.all({
        outlineL: Arr.head(runs),
        faceL: Arr.get(runs, 1),
        faceR: Arr.get(runs, runs.length - 2),
        outlineR: Arr.last(runs),
      }),
      () => runs.length >= 3,
    ),
    () => `row ${y} has ${runs.length} ink runs, not an outline and an inner run a side`,
  );
};

/** Whether `r`'s px at `(x, y)` is her skin: light (`SKIN_LUM`), or warm and red enough (`SKIN_RED`, `SKIN_WARM`). */
const isSkin = (r: Raster, x: number, y: number) => {
  const i = (y * r.width + x) * 4;
  const [red, green] = [r.rgba[i] ?? 0, r.rgba[i + 1] ?? 0];
  return lumAt(r, x, y) >= SKIN_LUM || (red >= SKIN_RED && red - green >= SKIN_WARM);
};

/**
 * Row `y`'s `Edges` in `r`, the fade's: each side's outline and the first
 * drawn line in from it, a run darker than `LINE` and `LINE_WIDTH` px or
 * wider, whose face side holds her skin within `SKIN_REACH` px: the line of
 * her ear, cheek, jaw or neck. The hair's flecks are too narrow to count,
 * and her hair, its outline and the veil's folds have no skin beside them.
 * Fails where a side has no such line.
 */
const faceLinesOf = (r: Raster, y: number): Result.Result<Edges, string> => {
  const runs = inkRuns(r, y);
  const lines = Arr.filter(runsOf(r, y, LINE), ([a, b]) => b - a + 1 >= LINE_WIDTH);
  const skinBetween = (from: number, to: number) =>
    Arr.some(Arr.range(Math.max(0, from), Math.min(r.width - 1, to)), (x) => isSkin(r, x, y));
  return Result.fromOption(
    Option.flatMap(
      Option.all({ outlineL: Arr.head(runs), outlineR: Arr.last(runs) }),
      ({ outlineL, outlineR }) => {
        const inner = Arr.filter(lines, ([a, b]) => a > outlineL[1] && b < outlineR[0]);
        return Option.map(
          Option.all({
            faceL: Arr.findFirst(inner, ([, b]) => skinBetween(b + 1, b + SKIN_REACH)),
            faceR: Arr.findLast(inner, ([a]) => skinBetween(a - SKIN_REACH, a - 1)),
          }),
          ({ faceL, faceR }) => ({ outlineL, faceL, faceR, outlineR }),
        );
      },
    ),
    () => `row ${y} has no drawn line beside her skin within its outlines a side`,
  );
};

/** The centre of the ink run `[a, b]` of row `y`, each px weighed by its darkness, its anti-aliased edges with it. */
const centreOf = (r: Raster, y: number, [a, b]: readonly [number, number]) => {
  let [sum, weight] = [0, 0];
  for (let x = Math.max(0, a - 2); x <= Math.min(r.width - 1, b + 2); x++) {
    const w = Math.max(0, 200 - lumAt(r, x, y));
    sum += x * w;
    weight += w;
  }
  return sum / weight;
};

/**
 * The drape's outlines at row `chin` of `r`, `[left, right]`: on each side
 * the line fitted through its outermost ink run's centres on the `FIT` rows
 * down to the chin, read at the chin. Fails where a row has no ink.
 */
const outlinesAt = (r: Raster, chin: number): Result.Result<readonly [number, number], string> => {
  const rows = Arr.makeBy(FIT + 1, (i) => chin - FIT + i);
  const my = Arr.reduce(rows, 0, (s, y) => s + y) / rows.length;
  /** The line through the centres `outermost` picks on each row, read at the chin. */
  const lineOf = (
    outermost: (
      runs: ReadonlyArray<readonly [number, number]>,
    ) => Option.Option<readonly [number, number]>,
  ) =>
    Result.map(
      Result.all(
        Arr.map(rows, (y) =>
          Result.fromOption(
            Option.map(outermost(inkRuns(r, y)), (run) => [y, centreOf(r, y, run)] as const),
            () => `row ${y} has no ink`,
          ),
        ),
      ),
      (centres) => {
        const mx = Arr.reduce(centres, 0, (s, [, x]) => s + x) / centres.length;
        const slope =
          Arr.reduce(centres, 0, (s, [y, x]) => s + (y - my) * (x - mx)) /
          Arr.reduce(rows, 0, (s, y) => s + (y - my) ** 2);
        return mx + slope * (chin - my);
      },
    );
  return Result.all([lineOf(Arr.head), lineOf(Arr.last)] as const);
};

/**
 * `view` with its drape warped across on the rows from `BAND_TOP` down to
 * `chin`, each side alone. Row y's outline (its outermost ink run, its edge px
 * with it) and the paper beyond move whole by `shift` times an ease that runs
 * from 0 at the band's top to 1 at the chin (smoothstep, so the outline leaves
 * the painting's line and meets the torso's with no corner); the cloth between
 * it and the next ink in, her ear, cheek or jaw, stretches or narrows to meet
 * that ink, which stays put with the face inside it. Each px is read between
 * its two nearest source px. Fails where a row lacks an outline and a face
 * edge on each side, or where a side's cloth is too narrow to take its shift.
 */
const warped = (
  view: Raster,
  [shiftL, shiftR]: readonly [number, number],
  chin: number,
): Result.Result<Raster, string> => {
  const { width: w } = view;
  const rgba = Uint8Array.from(view.rgba);
  for (let y = BAND_TOP; y <= chin; y++) {
    const edges = edgesOf(view, y);
    if (Result.isFailure(edges)) return Result.fail(edges.failure);
    const { outlineL, faceL, faceR, outlineR } = edges.success;
    const t = (y - BAND_TOP) / (chin - BAND_TOP);
    const ease = t * t * (3 - 2 * t);
    const [sL, sR] = [shiftL * ease, shiftR * ease];
    // the cloth each side: from just past the outline's inner edge to just short of the face's ink
    const aL = outlineL[1] + 1;
    const bL = Math.max(faceL[0] - 1, aL + 1);
    const bR = faceR[1] + 1;
    const aR = Math.max(outlineR[0] - 1, bR + 1);
    if (bL - aL - sL <= 0 || aR + sR - bR <= 0)
      return Result.fail(`row ${y}: the drape's cloth is too narrow to take its shift`);
    /** The source column the warped row reads at `x`. */
    const sourceOf = (x: number) => {
      if (x <= aL + sL) return x - sL;
      if (x < bL) return aL + ((x - aL - sL) * (bL - aL)) / (bL - aL - sL);
      if (x <= bR) return x;
      if (x < aR + sR) return bR + ((x - bR) * (aR - bR)) / (aR + sR - bR);
      return x - sR;
    };
    for (let x = 0; x < w; x++) {
      const src = Math.min(w - 1, Math.max(0, sourceOf(x)));
      const x0 = Math.floor(src);
      const x1 = Math.min(w - 1, x0 + 1);
      const f = src - x0;
      for (let c = 0; c < 4; c++) {
        const p = view.rgba[(y * w + x0) * 4 + c] ?? 0;
        const q = view.rgba[(y * w + x1) * 4 + c] ?? 0;
        rgba[(y * w + x) * 4 + c] = Math.round(p + (q - p) * f);
      }
    }
  }
  return Result.succeed({ width: w, height: view.height, rgba });
};

/**
 * Each side's cloth on row `y` of `r`, `[left, right]`, each `[from, to]`:
 * from 2 px past the drape outline's ink to 2 px short of the next ink in, so
 * the inks' edge px stay out of it. Fails where the row lacks an outline and
 * a face edge on each side.
 */
const clothOf = (r: Raster, y: number) =>
  Result.map(
    faceLinesOf(r, y),
    ({ outlineL, faceL, faceR, outlineR }) =>
      [
        [outlineL[1] + 2, faceL[0] - 2],
        [faceR[1] + 2, outlineR[0] - 2],
      ] as const,
  );

/**
 * The px nearest each side's face edge over which `faded` reads the
 * neutral's cloth stretched or narrowed to the key's: the face edges lie
 * apart in the two paintings, the drape outlines together.
 */
const EDGE = 16;

/**
 * The column of the neutral's cloth `[c, d]` that the key's cloth `[a, b]`
 * reads at `x`, on the picture's left (`side` 0, the face edge past `b`) or
 * its right (1, the face edge before `a`): the same column on the outline's
 * side, where the warp has laid the key's outline on the neutral's, so the
 * neutral's folds keep their places and meet the torso's; and the `EDGE` px
 * nearest the key's face edge stretched or narrowed to end at the neutral's.
 * A cloth narrower than that is read across whole, end to end.
 */
const neutralColumn = (
  side: 0 | 1,
  [a, b]: readonly [number, number],
  [c, d]: readonly [number, number],
  x: number,
) => {
  const across = c + ((x - a) * (d - c)) / Math.max(1, b - a);
  if (side === 0) {
    const p = Math.min(b, d) - EDGE;
    if (p <= Math.max(a, c)) return across;
    if (x <= p) return Math.max(x, c);
    return p + ((x - p) * (d - p)) / Math.max(1, b - p);
  }
  const q = Math.max(a, c) + EDGE;
  if (q >= Math.min(b, d)) return across;
  if (x >= q) return Math.min(x, d);
  return c + ((x - a) * (q - c)) / Math.max(1, q - a);
};

/**
 * `drape` (a key's warped view) with its drape's cloth fading into the
 * `neutral` view's over the `FADE` rows down to `chin`: on each row and side
 * the key's cloth is mixed with the neutral's (`neutralColumn`), the
 * neutral's share easing from none to all at the chin (smoothstep). So at the
 * chin the cloth is the neutral's, which runs on into her torso's as in her
 * neutral painting; the inks and her face stay as the key paints them.
 */
const faded = (drape: Raster, neutral: Raster, chin: number): Result.Result<Raster, string> => {
  const { width: w } = drape;
  const rgba = Uint8Array.from(drape.rgba);
  for (let y = chin - FADE + 1; y <= chin; y++) {
    const t = (y - chin + FADE) / FADE;
    const share = t * t * (3 - 2 * t);
    const cloths = Result.all([clothOf(drape, y), clothOf(neutral, y)] as const);
    if (Result.isFailure(cloths)) return Result.fail(cloths.failure);
    const [key, base] = cloths.success;
    for (const side of [0, 1] as const) {
      const [a, b] = key[side];
      for (let x = a; x <= b; x++) {
        const src = neutralColumn(side, key[side], base[side], x);
        const x0 = Math.floor(src);
        const x1 = Math.min(w - 1, x0 + 1);
        const f = src - x0;
        for (let ch = 0; ch < 3; ch++) {
          const i = (y * w + x) * 4 + ch;
          const own = drape.rgba[i] ?? 0;
          const n0 = neutral.rgba[(y * w + x0) * 4 + ch] ?? 0;
          const n1 = neutral.rgba[(y * w + x1) * 4 + ch] ?? 0;
          rgba[i] = Math.round(own + (n0 + (n1 - n0) * f - own) * share);
        }
      }
    }
  }
  return Result.succeed({ width: w, height: drape.height, rgba });
};

/** The `head` part `view` cuts to by her poses-1 cut. */
const headOf = (view: Raster) =>
  Effect.gen(function* () {
    const parts = yield* Effect.fromResult(
      cutParts(view, CUTS['poses-1'], cutOptionsFor('poses-1', view)),
    );
    return yield* Option.match(
      Arr.findFirst(parts.parts, (p) => p.name === 'head'),
      {
        onNone: () => Effect.die(new Error('her poses-1 cut has no head part')),
        onSome: Effect.succeed,
      },
    );
  });

/** The lowest row of `r` holding a px (alpha above 0). */
const lowestRow = (r: Raster) => {
  for (let y = r.height - 1; y >= 0; y--)
    for (let x = 0; x < r.width; x++) if ((r.rgba[(y * r.width + x) * 4 + 3] ?? 0) > 0) return y;
  return -1;
};

const cut = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const sheet = yield* Effect.fromResult(decodePng(yield* fs.readFile(KEPT)));
  const [x0, y0, x1, y1] = boxOf('poses-1');
  const neutral = cropOf(sheet, [x0, y0, x1, y1]);
  // the chin row: her neutral head part's lowest, the torso's drape starting below it
  const chin = lowestRow((yield* headOf(neutral)).pixels);
  const [nL, nR] = yield* Effect.fromResult(outlinesAt(neutral, chin));
  yield* Effect.forEach(Record.toEntries(KEYS), ([name, [dx, dy]]) =>
    Effect.gen(function* () {
      const view = cropOf(sheet, [x0 + dx, y0 + dy, x1 + dx, y1 + dy]);
      const [kL, kR] = yield* Effect.fromResult(outlinesAt(view, chin));
      const drape = yield* Effect.fromResult(
        Result.flatMap(warped(view, [nL - kL, nR - kR], chin), (d) => faded(d, neutral, chin)),
      );
      const [wL, wR] = yield* Effect.fromResult(outlinesAt(drape, chin));
      const head = yield* headOf(drape);
      yield* fs.writeFile(`${here}/sheets/poses-1/head-${name}.png`, encodePng(head.pixels));
      yield* Console.log(
        `head-${name}.png: ${head.kept} px, at [${dx}, ${dy}], drape shifted ${(nL - kL).toFixed(1)} and ${(nR - kR).toFixed(1)} at row ${chin}, now ${(wL - nL).toFixed(2)} and ${(wR - nR).toFixed(2)} off the neutral's`,
      );
    }),
  );
});

if (import.meta.main) cut.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
