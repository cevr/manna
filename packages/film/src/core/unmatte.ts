// A cut-out's parts un-matted against the paper they were cut from. A part
// sheet's pixels are the kept view's, so the pixels at the figure's rim (the
// anti-aliased ones, and the sheet's paper the cut kept outside the ink)
// hold the sheet's paper; laid on another paper they show a light ring.
// Each rim pixel is solved once for a colour and an alpha that give it back
// over the sheet's paper: colour·α + paper·(1−α) = the pixel. Its alpha is
// its distance from the paper along the line to the colour of its
// neighbourhood that lies farthest from the paper (the ink beside it), and
// its colour the one that closes the sum, held to 0..255. A pixel the line
// does not reach (the sheet's paper, lighter or bluer than its flat colour
// at the rim) is paper: it keeps no alpha, so another paper shows there,
// and over the sheet's flat paper it differs from the kept pixel by its own
// distance from that paper. A px so cleared, or left near-clear, that the
// figure encloses (walled off from the ground and the frame by his inked
// parts) is his light cloth, not paper: it takes the sheet's px back, unless
// its clear region holds a pocket of the sheet's paper or touches paper the
// sheet shows open to the ground; a px within the paper's core (ΔE 2) stays
// cleared. A member's cut-out may ask four things more of it (`UnmatteOptions`): his cloth colours, so a light cloth the line does
// not reach is his and not paper; his thin parts, whose alpha is raised
// until the colour that closes the sum is in range, so a speck keeps its
// hue on another paper; the box's open edges, so paper the box cuts off
// anywhere on its other edges is cleared, not only at its corners; and his
// paper's grain, so a rim pixel darker than the paper by more than the
// sheet's own ground varies is his cloth, kept whole. Asked none, it is as
// above. Pure.

import { type Rgb, deltaE, labOf } from './cast-sheet-pixels.ts';

/** An edge of the view's box. */
export type BoxEdge = 'top' | 'right' | 'bottom' | 'left';

/** What a member's cut-out asks of its un-matte beyond its paper; none is asked by default. */
interface UnmatteOptions {
  /** His cloth colours: a pixel the line does not reach is his, kept whole, when it lies nearer one of them than the paper (ΔE76), not paper. */
  readonly keep?: ReadonlyArray<Rgb>;
  /** His thin parts, by their index front to back: a rim pixel a thin part holds takes the least alpha at or over its solved one that gives a colour in 0..255, never a clamped colour. */
  readonly thin?: ReadonlyArray<number>;
  /** The box's edges his figure leaves through (a bust's bottom edge), where paper may be his (a highlight): when given, a pocket of paper is cleared from every pixel of every other edge; when not, from the box's four corners only. */
  readonly open?: ReadonlyArray<BoxEdge>;
  /** His paper's grain, luma (0..255): a rim pixel darker than the paper by more than it is his cloth, kept whole at its colour and alpha 255, not solved toward the paper. The sheet's own ground runs this far darker than its median paper, so a pixel darker still is no paper. */
  readonly grain?: number;
}

/** How far in from the ground the rim reaches: this many px (8-neighbour steps), through pixels lighter than ink. */
const UNMATTE_BAND = 4;

/** How far around a rim pixel its ink is looked for, px. */
const INK_REACH = 5;

/** A pixel at or under this luma (0..255) is ink: the rim stops at it. */
const INK_LUMA = 110;

const BLACK: Rgb = [0, 0, 0];

/** The parts as one view: each pixel's frontmost holder (-1 for ground) and its colour there. */
interface Holders {
  readonly front: Int16Array;
  readonly colourAt: (i: number) => Rgb;
  readonly width: number;
  readonly height: number;
}

const lumaOf = (c: Rgb) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

const rgbOf = (rgba: Uint8Array, i: number): Rgb => [
  rgba[i * 4]!,
  rgba[i * 4 + 1]!,
  rgba[i * 4 + 2]!,
];

const holdersOf = (parts: ReadonlyArray<Uint8Array>, width: number, height: number): Holders => {
  const n = width * height;
  const front = new Int16Array(n).fill(-1);
  for (let k = parts.length - 1; k >= 0; k--)
    for (let i = 0; i < n; i++) if (parts[k]![i * 4 + 3]! > 0) front[i] = k;
  return { front, colourAt: (i) => rgbOf(parts[front[i]!]!, i), width, height };
};

/**
 * The part textures (RGBA, `width` × `height`, front to back) with each
 * rim pixel un-matted against `paper`: an opaque pixel reached from the
 * ground (where no part has a pixel) within `UNMATTE_BAND` steps through
 * pixels lighter than ink, the paint behind it (hidden at rest) cleared, so
 * the rest pose over the paper is the view there. A rim pixel so cleared
 * that the figure encloses takes the sheet's own pixel back
 * (`restoreEnclosed`). Every other pixel is kept byte for byte.
 */
export const unmatte = (
  parts: ReadonlyArray<Uint8Array>,
  width: number,
  height: number,
  paper: Rgb,
  options: UnmatteOptions = {},
): ReadonlyArray<Uint8Array> => {
  const holders = holdersOf(parts, width, height);
  const paperLab = labOf(paper);
  const keep = (options.keep ?? []).map(labOf);
  // a px the line does not reach: his cloth when it lies nearer a kept cloth colour than the paper
  const isCloth = (c: Rgb) => {
    if (keep.length === 0) return false;
    const lab = labOf(c);
    const fromPaper = deltaE(lab, paperLab);
    return keep.some((k) => deltaE(lab, k) < fromPaper);
  };
  const thin = new Set(options.thin);
  const solve = (i: number) =>
    solved(
      holders.colourAt(i),
      inkNear(holders, i, paper),
      paper,
      isCloth,
      thin.has(holders.front[i]!),
    );
  const rim = rimOf(holders, (i) => solve(i)[3] === 0, options.open);
  const { grain } = options;
  const paperLuma = lumaOf(paper);
  // a solved px darker than the paper by more than its grain: his cloth, kept whole
  const floored = (i: number, s: ReturnType<typeof solve>) => {
    if (grain === undefined || s[3] === 255) return s;
    const c = holders.colourAt(i);
    return paperLuma - lumaOf(c) > grain ? ([c[0], c[1], c[2], 255] as const) : s;
  };
  const out = parts.map((p) => Uint8Array.from(p));
  const changed = new Uint8Array(width * height);
  for (const i of rim) {
    const k = holders.front[i]!;
    if (parts[k]![i * 4 + 3] !== 255) continue;
    // the view shows this px, the sheet's paper mixed in: paint behind it, hidden at rest, goes too
    for (let b = k + 1; b < parts.length; b++) out[b]!.fill(0, i * 4, i * 4 + 4);
    out[k]!.set(floored(i, solve(i)), i * 4);
    changed[i] = 1;
  }
  restoreEnclosed(parts, out, holders, changed, paperLab);
  return out;
};

/** A view px under this alpha (0..255) reads as clear: the fence the cut's hole check reads, so both see one hole. */
const FENCE = 16;

/** A px within this ΔE76 of the paper is the sheet's paper or its grain: never taken back, since kept it shows as a halo on another paper. */
const PAPER_CORE = 2;

/** A held px within this ΔE76 of the paper is the sheet's ground, as far as the cut's ground reading reaches on the cast's sheets (1.5 × a sheet's 90th-centile grain): a gap it opens to the ground is open paper, and where his outline closes round it, it is a kept hole. A px past it is his cloth or a seam, which closes a gap. */
const SHEET_GROUND = 4.25;

/** A clear region or kept hole holding this many paper px (within `PAPER_CORE`) is a pocket of the sheet's paper inside him: a clear region that holds one, or any px of a kept hole that is one, stays cleared. */
const POCKET = 9;

/** A part whose opaque px are ink (at or under `INK_LUMA`) at most this share is a shadow on the ground: a shadow's darkest grain is a few specks of its px, where every part of the figure carries an outline. */
const SHADOW_INK = 0.035;

/** Whether part `p` is a shadow on the ground, which walls nothing in: so few of its opaque px are ink that they are specks of the shadow's own grain, not an outline. */
const shadowOf = (p: Uint8Array) => {
  let [opaque, ink] = [0, 0];
  for (let i = 0; i < p.length; i += 4)
    if (p[i + 3] === 255) {
      opaque++;
      if (lumaOf([p[i]!, p[i + 1]!, p[i + 2]!]) <= INK_LUMA) ink++;
    }
  return ink <= opaque * SHADOW_INK;
};

const onFrame = (i: number, width: number, height: number) => {
  const [x, y] = [i % width, Math.floor(i / width)];
  return x === 0 || y === 0 || x === width - 1 || y === height - 1;
};

/** The px reached from each seed that `passes`, through px that pass, stepping to `next(i)`: 1 reached, 0 not. */
const flood = (
  n: number,
  passes: (i: number) => boolean,
  seed: (i: number) => boolean,
  next: (i: number) => ReadonlyArray<number>,
) => {
  const reached = new Uint8Array(n);
  const stack: number[] = [];
  for (let i = 0; i < n; i++)
    if (passes(i) && seed(i)) {
      reached[i] = 1;
      stack.push(i);
    }
  while (stack.length > 0)
    for (const j of next(stack.pop()!))
      if (reached[j] === 0 && passes(j)) {
        reached[j] = 1;
        stack.push(j);
      }
  return reached;
};

/** Each connected run of the px that `isIn`, stepping to `next(i)`. */
const regionsOf = (
  n: number,
  isIn: (i: number) => boolean,
  next: (i: number) => ReadonlyArray<number>,
) => {
  const seen = new Uint8Array(n);
  const regions: number[][] = [];
  for (let s = 0; s < n; s++) {
    if (seen[s] === 1 || !isIn(s)) continue;
    seen[s] = 1;
    const region = [s];
    for (let r = 0; r < region.length; r++)
      for (const j of next(region[r]!))
        if (seen[j] === 0 && isIn(j)) {
          seen[j] = 1;
          region.push(j);
        }
    regions.push(region);
  }
  return regions;
};

/** Each held px's distance from the paper (ΔE76) at its sheet colour, worked out once per colour. */
const paperDistance = ({ colourAt }: Holders, paperLab: Rgb) => {
  const byColour = new Map<number, number>();
  return (i: number) => {
    const c = colourAt(i);
    const key = (c[0] << 16) | (c[1] << 8) | c[2];
    let d = byColour.get(key);
    if (d === undefined) {
      d = deltaE(labOf(c), paperLab);
      byColour.set(key, d);
    }
    return d;
  };
};

/** The view's alpha at rest (0..255): the parts composited front to back. */
const viewAlphaOf = (parts: ReadonlyArray<Uint8Array>, n: number) => {
  const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let through = 1;
    for (const p of parts) through *= 1 - p[i * 4 + 3]! / 255;
    alpha[i] = Math.round(255 * (1 - through));
  }
  return alpha;
};

/** The in-frame 4-neighbours of pixel `i`. */
const sides = (i: number, width: number, height: number) => {
  const x = i % width;
  const out: number[] = [];
  if (x > 0) out.push(i - 1);
  if (x < width - 1) out.push(i + 1);
  if (i >= width) out.push(i - width);
  if (i < width * (height - 1)) out.push(i + width);
  return out;
};

/**
 * Gives the sheet's own px back, in every part, to each px the rim un-matted
 * (`changed`) to a clear or near-clear one (view alpha under `FENCE`) that
 * the figure encloses: light cloth the line to the ink does not reach, which
 * cleared is a hole in him. The outside is what floods (8-connected) from
 * the ground and the frame's border past his walls: a px his inked parts
 * hold at view alpha `FENCE` or more, so his shadow on the ground walls
 * nothing in: a part is his shadow when at most `SHADOW_INK` of its opaque
 * px are ink (`shadowOf`), since its darkest grain is specks and not an
 * outline. The flood steps diagonally, so a gap his outline leaves only at a
 * corner is outside, and no px it does not reach lies beside the outside or
 * on the frame: none taken back shows as a fleck on his outline. A px is
 * enclosed when the outside does not reach it, and its clear region
 * (4-connected) is taken back but for two things that stay cleared: a region
 * holding `POCKET` px of paper, or any px of the sheet's open paper or of a
 * sheet pocket (`sheetPocketsOf`), since a gap the sheet shows open to the
 * ground is no hole in him; and each px of paper itself (within
 * `PAPER_CORE`), which kept would show as a halo.
 */
const restoreEnclosed = (
  parts: ReadonlyArray<Uint8Array>,
  out: ReadonlyArray<Uint8Array>,
  holders: Holders,
  changed: Uint8Array,
  paperLab: Rgb,
) => {
  const { front, width, height } = holders;
  const n = width * height;
  const fromPaper = paperDistance(holders, paperLab);
  const isCore = (i: number) => fromPaper(i) <= PAPER_CORE;
  const alpha = viewAlphaOf(out, n);
  const inked = out.filter((_, k) => !shadowOf(parts[k]!));
  const wallAlpha = inked.length === out.length ? alpha : viewAlphaOf(inked, n);
  const step8 = (i: number) => neighbours(i, width, height);
  const step4 = (i: number) => sides(i, width, height);
  const outside = flood(
    n,
    (i) => wallAlpha[i]! < FENCE,
    (i) => front[i] === -1 || onFrame(i, width, height),
    step8,
  );
  const enclosed = (i: number) => outside[i] === 0 && alpha[i]! < FENCE;
  let sheet: ReturnType<typeof sheetPocketsOf> | undefined;
  for (const region of regionsOf(n, enclosed, step4)) {
    if (!region.some((i) => changed[i] === 1)) continue;
    if (region.filter(isCore).length >= POCKET) continue;
    sheet ??= sheetPocketsOf(holders, fromPaper);
    const { open, pockets } = sheet;
    if (region.some((i) => open[i] === 1 || pockets[i] === 1)) continue;
    for (const i of region)
      if (changed[i] === 1 && !isCore(i))
        for (let k = 0; k < parts.length; k++)
          out[k]!.set(parts[k]!.subarray(i * 4, i * 4 + 4), i * 4);
  }
};

/**
 * The sheet's open paper and its pockets, 1 at each px. `open` is the run of
 * the ground and held px within `SHEET_GROUND` of the paper that joins the
 * ground or the frame's border: a gap the sheet shows open. It is 8-connected,
 * as the outside is, since paper that touches paper at a corner shows through
 * on the sheet. A pocket is each kept hole (such a run that `open` does not
 * reach) holding `POCKET` px of paper (within `PAPER_CORE`) or more, as the
 * cut reads its pockets.
 */
const sheetPocketsOf = ({ front, width, height }: Holders, fromPaper: (i: number) => number) => {
  const n = width * height;
  const step4 = (i: number) => sides(i, width, height);
  const groundLike = (i: number) => front[i] === -1 || fromPaper(i) <= SHEET_GROUND;
  const open = flood(
    n,
    groundLike,
    (i) => front[i] === -1 || onFrame(i, width, height),
    (i) => neighbours(i, width, height),
  );
  const pockets = new Uint8Array(n);
  for (const hole of regionsOf(n, (i) => open[i] === 0 && groundLike(i), step4))
    if (hole.filter((i) => fromPaper(i) <= PAPER_CORE).length >= POCKET)
      for (const i of hole) pockets[i] = 1;
  return { open, pockets };
};

/**
 * `c`'s colour and alpha (RGBA) over `paper`, its alpha along the line from
 * `paper` to `ink`. A pixel the line does not reach is paper (no alpha)
 * unless it `isCloth`, then kept whole; a `thin` part's alpha is raised to
 * the least that gives a colour in 0..255 (`inGamut`).
 */
const solved = (
  c: Rgb,
  ink: Rgb,
  paper: Rgb,
  isCloth: (c: Rgb) => boolean,
  thin: boolean,
): readonly [number, number, number, number] => {
  const d = [ink[0] - paper[0], ink[1] - paper[1], ink[2] - paper[2]] as const;
  const len2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const along =
    len2 === 0
      ? 1
      : ((c[0] - paper[0]) * d[0] + (c[1] - paper[1]) * d[1] + (c[2] - paper[2]) * d[2]) / len2;
  const reached = Math.round(Math.max(0, Math.min(1, along)) * 255);
  if (reached === 0) return isCloth(c) ? [c[0], c[1], c[2], 255] : [0, 0, 0, 0];
  const a = thin ? inGamut(c, paper, reached) : reached;
  const t = a / 255;
  const channel = (j: 0 | 1 | 2) =>
    Math.max(0, Math.min(255, Math.round((c[j] - paper[j] * (1 - t)) / t)));
  return [channel(0), channel(1), channel(2), a];
};

/**
 * The least alpha (0..255), from `from` up, at which a colour closes `c`
 * over `paper` with each channel in 0..255: colour·a = c·255 − paper·(255 − a),
 * held in whole numbers so no rounding decides it.
 */
const inGamut = (c: Rgb, paper: Rgb, from: number) => {
  const out = (a: number) =>
    [0, 1, 2].some((j) => {
      const v = c[j]! * 255 - paper[j]! * (255 - a);
      return v < 0 || v > 255 * a;
    });
  let a = from;
  while (a < 255 && out(a)) a++;
  return a;
};

/** The in-frame 8-neighbours of pixel `i`. */
const neighbours = (i: number, width: number, height: number) => {
  const [x, y] = [i % width, Math.floor(i / width)];
  const out: number[] = [];
  for (let v = Math.max(0, y - 1); v <= Math.min(height - 1, y + 1); v++)
    for (let u = Math.max(0, x - 1); u <= Math.min(width - 1, x + 1); u++) out.push(v * width + u);
  return out;
};

/**
 * The rim: each figure pixel reached from the ground within `UNMATTE_BAND`
 * 8-neighbour steps, each step from the ground or from a rim pixel lighter
 * than ink (an ink pixel is reached, and stops the walk). A pixel that is
 * paper (`isPaper`: it solves to no alpha) costs no step, so a part that
 * holds the sheet's paper deeper than the band is cleared to its ink, and
 * the walk still reaches `UNMATTE_BAND` into the ink's anti-aliased edge.
 * The frame's border is not ground; a pocket of the sheet's paper the
 * view's box cuts off from the ground is added after (`pocketsOf`).
 */
const rimOf = (
  { front, colourAt, width, height }: Holders,
  isPaper: (i: number) => boolean,
  open: ReadonlyArray<BoxEdge> | undefined,
) => {
  const rim: number[] = [];
  const seen = Uint8Array.from(front, (k) => (k === -1 ? 1 : 0));
  let from = [...front.keys()].filter((i) => front[i] === -1);
  for (let step = 1; step <= UNMATTE_BAND && from.length > 0; step++) {
    const next: number[] = [];
    // `from` grows as paper is reached: paper walks on within this step
    for (let f = 0; f < from.length; f++)
      for (const j of neighbours(from[f]!, width, height)) {
        if (seen[j] === 1) continue;
        seen[j] = 1;
        rim.push(j);
        if (lumaOf(colourAt(j)) <= INK_LUMA) continue;
        if (isPaper(j)) from.push(j);
        else next.push(j);
      }
    from = next;
  }
  return [...rim, ...pocketsOf(seen, isPaper, width, height, open)];
};

/** The pixels on an edge of the box and on no `open` edge (a corner lies on two edges, and is left out when either is open). */
const closedEdgeOf = (width: number, height: number, open: ReadonlyArray<BoxEdge>) => {
  const perimeter = new Set<number>();
  for (let x = 0; x < width; x++) perimeter.add(x).add((height - 1) * width + x);
  for (let y = 0; y < height; y++) perimeter.add(y * width).add(y * width + width - 1);
  const isOpen = (i: number) => {
    const [x, y] = [i % width, Math.floor(i / width)];
    return (
      (y === 0 && open.includes('top')) ||
      (x === width - 1 && open.includes('right')) ||
      (y === height - 1 && open.includes('bottom')) ||
      (x === 0 && open.includes('left'))
    );
  };
  return [...perimeter].filter((i) => !isOpen(i));
};

/**
 * The paper pixels the walk did not reach that join the frame's seeds
 * through paper alone: a pocket of the sheet's paper the view's box cuts
 * off between his ink and the box. Only paper is walked, so no colour of
 * his is reached. With `open` given, every pixel of every edge not open
 * seeds the walk; without it, the four corners only, since paper on an edge
 * of the box may be inside him (a highlight where a bust's tunic leaves the
 * box) and no edge is named open.
 */
const pocketsOf = (
  seen: Uint8Array,
  isPaper: (i: number) => boolean,
  width: number,
  height: number,
  open: ReadonlyArray<BoxEdge> | undefined,
) => {
  const pocket: number[] = [];
  const take = (i: number) => {
    if (seen[i] === 1) return;
    seen[i] = 1;
    if (isPaper(i)) pocket.push(i);
  };
  const seeds =
    open === undefined
      ? [0, width - 1, (height - 1) * width, height * width - 1]
      : closedEdgeOf(width, height, open);
  for (const i of seeds) take(i);
  for (let f = 0; f < pocket.length; f++)
    for (const j of neighbours(pocket[f]!, width, height)) take(j);
  return pocket;
};

/** The view's colour within `INK_REACH` of pixel `i` that lies farthest from `paper`: black where none there is ink (paper held deeper than the reach). */
const inkNear = ({ front, colourAt, width, height }: Holders, i: number, paper: Rgb): Rgb => {
  const [x, y] = [i % width, Math.floor(i / width)];
  let best: Rgb = paper;
  let far = -1;
  for (let v = Math.max(0, y - INK_REACH); v <= Math.min(height - 1, y + INK_REACH); v++)
    for (let u = Math.max(0, x - INK_REACH); u <= Math.min(width - 1, x + INK_REACH); u++) {
      const j = v * width + u;
      if (front[j] === -1) continue;
      const c = colourAt(j);
      const d = (c[0] - paper[0]) ** 2 + (c[1] - paper[1]) ** 2 + (c[2] - paper[2]) ** 2;
      if (d > far) [far, best] = [d, c];
    }
  return lumaOf(best) > INK_LUMA ? BLACK : best;
};
