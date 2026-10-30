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
// figure encloses (walled off from the ground by his ink and cloth) is his
// light cloth, not paper: it takes the sheet's px back, unless its clear
// region holds a pocket of the sheet's paper, and a px within ΔE 2 of the
// paper stays cleared. A member's cut-out may ask four things more of
// it (`UnmatteOptions`): his cloth colours, so a light cloth the line does
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
  restoreEnclosed(parts, out, holders, changed, (c) => deltaE(labOf(c), paperLab) <= PAPER_CORE);
  return out;
};

/** A view px under this alpha (0..255) reads as clear: the fence the cut's hole check reads, so both see one hole. */
const FENCE = 16;

/** The walls round a clear region are closed at this radius, px, as the cut's hole check closes them: a one-px slit in his ink is no way out. */
const WALL_CLOSE = 1;

/** A px within this ΔE76 of the paper is the sheet's paper or its grain: never taken back, since kept it shows as a halo on another paper. */
const PAPER_CORE = 2;

/** A clear region holding this many paper px (within `PAPER_CORE`) is a pocket of the sheet's paper inside him, and stays cleared. */
const POCKET = 9;

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

/** `mask` (1 set, 0 clear) dilated by a square of radius `r`; the frame's outside is clear. */
const dilated = (mask: Uint8Array, width: number, height: number, r: number) => {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let set = 0;
      for (let v = Math.max(0, y - r); v <= Math.min(height - 1, y + r) && set === 0; v++)
        for (let u = Math.max(0, x - r); u <= Math.min(width - 1, x + r) && set === 0; u++)
          set = mask[v * width + u]!;
      out[y * width + x] = set;
    }
  return out;
};

/** `mask` closed at radius `r`: dilated, then eroded (its complement dilated, complemented), so a gap of up to 2r px between its walls is shut. */
const closedAt = (mask: Uint8Array, width: number, height: number, r: number) => {
  const grown = dilated(mask, width, height, r);
  const shrunk = dilated(
    Uint8Array.from(grown, (g) => 1 - g),
    width,
    height,
    r,
  );
  return Uint8Array.from(shrunk, (s) => 1 - s);
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
 * cleared is a hole in him. A px is enclosed when its clear region
 * (4-connected) joins neither the ground nor the frame's border past his
 * walls (view alpha `FENCE` or more, closed at `WALL_CLOSE`). A region
 * holding `POCKET` px of paper (`isCore`) is a pocket of the sheet's paper
 * and stays cleared, and so does each px of paper itself, which kept would
 * show as a halo.
 */
const restoreEnclosed = (
  parts: ReadonlyArray<Uint8Array>,
  out: ReadonlyArray<Uint8Array>,
  holders: Holders,
  changed: Uint8Array,
  isCore: (c: Rgb) => boolean,
) => {
  const { colourAt } = holders;
  for (const region of enclosedRegions(out, holders)) {
    if (region.filter((i) => isCore(colourAt(i))).length >= POCKET) continue;
    for (const i of region)
      if (changed[i] === 1 && !isCore(colourAt(i)))
        for (let k = 0; k < parts.length; k++)
          out[k]!.set(parts[k]!.subarray(i * 4, i * 4 + 4), i * 4);
  }
};

/** The px the ground reaches past no wall: a flood from each non-wall px of the ground or the frame's border. */
const groundReach = (wall: Uint8Array, { front, width, height }: Holders) => {
  const reached = new Uint8Array(width * height);
  const stack: number[] = [];
  const onBorder = (i: number) => {
    const [x, y] = [i % width, Math.floor(i / width)];
    return x === 0 || y === 0 || x === width - 1 || y === height - 1;
  };
  for (let i = 0; i < reached.length; i++)
    if (wall[i] === 0 && (front[i] === -1 || onBorder(i))) {
      reached[i] = 1;
      stack.push(i);
    }
  while (stack.length > 0)
    for (const j of sides(stack.pop()!, width, height))
      if (reached[j] === 0 && wall[j] === 0) {
        reached[j] = 1;
        stack.push(j);
      }
  return reached;
};

/** Each 4-connected region of held px under `FENCE` in the view `out` that the ground does not reach past his walls. */
const enclosedRegions = (out: ReadonlyArray<Uint8Array>, holders: Holders) => {
  const { front, width, height } = holders;
  const n = width * height;
  const alpha = viewAlphaOf(out, n);
  const wall = closedAt(
    Uint8Array.from(alpha, (a) => (a >= FENCE ? 1 : 0)),
    width,
    height,
    WALL_CLOSE,
  );
  const reached = groundReach(wall, holders);
  const enclosed = (i: number) => reached[i] === 0 && alpha[i]! < FENCE && front[i] !== -1;
  const seen = new Uint8Array(n);
  const regions: number[][] = [];
  for (let s = 0; s < n; s++) {
    if (seen[s] === 1 || !enclosed(s)) continue;
    seen[s] = 1;
    const region = [s];
    for (let r = 0; r < region.length; r++)
      for (const j of sides(region[r]!, width, height))
        if (seen[j] === 0 && enclosed(j)) {
          seen[j] = 1;
          region.push(j);
        }
    regions.push(region);
  }
  return regions;
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
