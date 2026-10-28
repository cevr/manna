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
// distance from that paper. Pure.

import type { Rgb } from './cast-sheet-pixels.ts';

/** How far in from the ground the rim reaches: this many px (8-neighbour steps), through pixels lighter than ink. */
export const UNMATTE_BAND = 4;

/** How far around a rim pixel its ink is looked for, px. */
const INK_REACH = 5;

/** A pixel at or under this luma (0..255) is ink: the rim stops at it. */
const INK_LUMA = 110;

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
 * pixels lighter than ink, the view's own at rest (no part behind it holds
 * ink there; paint lighter than ink behind it is paper, and goes). Every
 * other pixel is kept byte for byte.
 */
export const unmatte = (
  parts: ReadonlyArray<Uint8Array>,
  width: number,
  height: number,
  paper: Rgb,
): ReadonlyArray<Uint8Array> => {
  const holders = holdersOf(parts, width, height);
  const rim = rimOf(holders);
  const out = parts.map((p) => Uint8Array.from(p));
  for (const i of rim) {
    const k = holders.front[i]!;
    if (parts[k]![i * 4 + 3] !== 255) continue;
    const behind = parts.slice(k + 1).filter((p) => p[i * 4 + 3]! > 0);
    if (behind.some((p) => lumaOf(rgbOf(p, i)) <= INK_LUMA)) continue;
    for (let b = k + 1; b < parts.length; b++) out[b]!.fill(0, i * 4, i * 4 + 4);
    out[k]!.set(solved(holders.colourAt(i), inkNear(holders, i, paper), paper), i * 4);
  }
  return out;
};

/** `c`'s colour and alpha (RGBA) over `paper`, its alpha along the line from `paper` to `ink`. */
const solved = (c: Rgb, ink: Rgb, paper: Rgb): readonly [number, number, number, number] => {
  const d = [ink[0] - paper[0], ink[1] - paper[1], ink[2] - paper[2]] as const;
  const len2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const along =
    len2 === 0
      ? 1
      : ((c[0] - paper[0]) * d[0] + (c[1] - paper[1]) * d[1] + (c[2] - paper[2]) * d[2]) / len2;
  const a = Math.round(Math.max(0, Math.min(1, along)) * 255);
  if (a === 0) return [0, 0, 0, 0];
  const t = a / 255;
  const channel = (j: 0 | 1 | 2) =>
    Math.max(0, Math.min(255, Math.round((c[j] - paper[j] * (1 - t)) / t)));
  return [channel(0), channel(1), channel(2), a];
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
 * than ink (an ink pixel is reached, and stops the walk). The frame's border
 * is not ground.
 */
const rimOf = ({ front, colourAt, width, height }: Holders) => {
  const rim: number[] = [];
  const seen = Uint8Array.from(front, (k) => (k === -1 ? 1 : 0));
  let from = [...front.keys()].filter((i) => front[i] === -1);
  for (let step = 1; step <= UNMATTE_BAND; step++) {
    const next: number[] = [];
    for (const j of from.flatMap((i) => neighbours(i, width, height))) {
      if (seen[j] === 1) continue;
      seen[j] = 1;
      rim.push(j);
      if (lumaOf(colourAt(j)) > INK_LUMA) next.push(j);
    }
    from = next;
  }
  return rim;
};

/** The view's colour within `INK_REACH` of pixel `i` that lies farthest from `paper`. */
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
  return best;
};
