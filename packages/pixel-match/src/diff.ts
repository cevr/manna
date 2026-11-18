/* oxlint-disable effect/noNullish -- a flood fill over a plain stack of pixel indices: an empty stack pops undefined. */

/**
 * The strict diff: a pure function of two decoded pictures of one size and
 * the masks laid over them. A device pixel differs when any of red, green
 * and blue is further apart than `channel` of 255 and it lies under no
 * mask; alpha is not read, since every capture is opaque. Two sizes are no
 * count at all: they fail as `Sizes`.
 */

import type { Picture } from './png.ts';

/** A rectangle of device pixels left out of the score, and why. */
export interface Mask {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly reason: string;
}

/** The numbers of one pair, in the report's terms (`accept.ts`). */
export interface Score {
  /** The channel limit the pair was scored at. */
  readonly channel: number;
  /** Every pixel of the picture. */
  readonly total: number;
  /** The pixels under some mask. */
  readonly masked: number;
  /** The pixels scored: `total - masked`. */
  readonly scored: number;
  /** The scored pixels that differ. */
  readonly differing: number;
  /** The pixels of the largest 8-connected region of differing pixels. */
  readonly largest: number;
}

/** A pair scored, with the map of where it differs (1 a differing pixel, 2 a masked one). */
interface Scored extends Score {
  readonly _tag: 'Scored';
  readonly map: Uint8Array;
}

/** Two pictures of two sizes: never counted. */
interface Sizes {
  readonly _tag: 'Sizes';
  readonly reference: string;
  readonly screen: string;
}

type Diff = Scored | Sizes;

/** Which pixels lie under some mask, clipped to the picture: 1 under one, else 0. */
const maskMap = (width: number, height: number, masks: ReadonlyArray<Mask>) => {
  const under = new Uint8Array(width * height);
  for (const mask of masks) {
    const [left, top] = [Math.max(0, Math.floor(mask.x)), Math.max(0, Math.floor(mask.y))];
    const right = Math.min(width, Math.ceil(mask.x + mask.width));
    const bottom = Math.min(height, Math.ceil(mask.y + mask.height));
    for (let y = top; y < bottom; y++)
      under.fill(1, y * width + left, y * width + Math.max(left, right));
  }
  return under;
};

/** Whether the pixel at `i` of two RGBA buffers is further apart than `channel` in red, green or blue. */
const apart = (a: Uint8Array, b: Uint8Array, i: number, channel: number) =>
  Math.abs((a[i * 4] ?? 0) - (b[i * 4] ?? 0)) > channel ||
  Math.abs((a[i * 4 + 1] ?? 0) - (b[i * 4 + 1] ?? 0)) > channel ||
  Math.abs((a[i * 4 + 2] ?? 0) - (b[i * 4 + 2] ?? 0)) > channel;

/** The pixels around `at` (its 8 neighbours inside the picture). */
const around = (at: number, width: number, height: number) => {
  const [x, y] = [at % width, Math.floor(at / width)];
  const near: number[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const [nx, ny] = [x + dx, y + dy];
      if ((dx !== 0 || dy !== 0) && nx >= 0 && ny >= 0 && nx < width && ny < height)
        near.push(ny * width + nx);
    }
  return near;
};

/** The size of the region of 1s that holds `start`, each pixel of it marked in `seen`. */
const regionAt = (
  map: Uint8Array,
  seen: Uint8Array,
  start: number,
  width: number,
  height: number,
) => {
  const stack = [start];
  seen[start] = 1;
  let size = 0;
  for (let at = stack.pop(); at !== undefined; at = stack.pop()) {
    size += 1;
    for (const next of around(at, width, height))
      if (map[next] === 1 && seen[next] !== 1) {
        seen[next] = 1;
        stack.push(next);
      }
  }
  return size;
};

/** The size of the largest 8-connected region of the pixels `map` marks 1. */
const largestRegion = (map: Uint8Array, width: number, height: number) => {
  const seen = new Uint8Array(map.length);
  let largest = 0;
  for (let start = 0; start < map.length; start++)
    if (map[start] === 1 && seen[start] !== 1)
      largest = Math.max(largest, regionAt(map, seen, start, width, height));
  return largest;
};

/** Scores `screen` against `reference` at `channel`, the pixels under `masks` left out. */
export const diff = (
  reference: Picture,
  screen: Picture,
  masks: ReadonlyArray<Mask>,
  channel: number,
): Diff => {
  if (reference.width !== screen.width || reference.height !== screen.height)
    return {
      _tag: 'Sizes',
      reference: `${reference.width}x${reference.height}`,
      screen: `${screen.width}x${screen.height}`,
    };
  const { width, height } = reference;
  const map = maskMap(width, height, masks);
  let [masked, differing] = [0, 0];
  for (let i = 0; i < map.length; i++) {
    if (map[i] === 1) {
      map[i] = 2;
      masked += 1;
    } else if (apart(reference.rgba, screen.rgba, i, channel)) {
      map[i] = 1;
      differing += 1;
    }
  }
  const total = width * height;
  return {
    _tag: 'Scored',
    channel,
    total,
    masked,
    scored: total - masked,
    differing,
    largest: largestRegion(map, width, height),
    map,
  };
};

/** The rows of `picture` from `top`, `height` of them. */
const rowsOf = (picture: Picture, top: number, height: number): Picture => {
  const stride = picture.width * 4;
  return {
    width: picture.width,
    height,
    rgba: picture.rgba.slice(top * stride, (top + height) * stride),
  };
};

/** A band of a picture: its top row, and the row under its last. */
export interface Band {
  readonly top: number;
  readonly bottom: number;
}

/**
 * The content bands of a pair, laid edge to edge (spec, "Heartseed's
 * content band"): each picture's rows from its band's top to its bottom,
 * cut to the shorter of the two, kept from the top (`anchor: top`) or from
 * the foot (`anchor: bottom`). The bands' edges are clipped to each picture.
 * `offset` is how far down the reference's band starts in its own picture,
 * so masks drawn on the reference move with it.
 */
export const bandsOf = (
  reference: Picture,
  referenceBand: Band,
  screen: Picture,
  screenBand: Band,
  anchor: 'top' | 'bottom',
) => {
  const clip = (picture: Picture, band: Band) => {
    const top = Math.max(0, Math.min(picture.height, Math.round(band.top)));
    return { top, bottom: Math.max(top, Math.min(picture.height, Math.round(band.bottom))) };
  };
  const [a, b] = [clip(reference, referenceBand), clip(screen, screenBand)];
  const height = Math.min(a.bottom - a.top, b.bottom - b.top);
  let [aTop, bTop] = [a.top, b.top];
  if (anchor === 'bottom') [aTop, bTop] = [a.bottom - height, b.bottom - height];
  return {
    reference: rowsOf(reference, aTop, height),
    screen: rowsOf(screen, bTop, height),
    offset: aTop,
  };
};

/** Where a banded pair's two bands lie, and which edge they are laid at. */
export interface Banding {
  readonly reference: Band;
  readonly screen: Band;
  readonly anchor: 'top' | 'bottom';
}

/**
 * Scores a whole reference against a whole screen at `channel`: over the
 * whole pictures, or over their bands (`bandsOf`) when `bands` is given,
 * the masks (drawn on the reference's whole picture) moved up with the
 * reference's band. `picture` is the whole reference's pixels, beside the
 * score's `total`, the band's; the pair as scored and its masks so laid
 * come back for the ladder and the diff picture.
 */
export const scorePair = (
  wholeReference: Picture,
  wholeScreen: Picture,
  masks: ReadonlyArray<Mask>,
  channel: number,
  bands: Banding | undefined,
) => {
  const picture = wholeReference.width * wholeReference.height;
  if (bands === undefined)
    return {
      reference: wholeReference,
      screen: wholeScreen,
      laid: masks,
      picture,
      scored: diff(wholeReference, wholeScreen, masks, channel),
    };
  const cut = bandsOf(wholeReference, bands.reference, wholeScreen, bands.screen, bands.anchor);
  const laid = masks.map((mask) => ({ ...mask, y: mask.y - cut.offset }));
  return {
    reference: cut.reference,
    screen: cut.screen,
    laid,
    picture,
    scored: diff(cut.reference, cut.screen, laid, channel),
  };
};

/** The differing count of one pair at each channel limit asked, as the calibration reports it. */
export const ladder = (
  reference: Picture,
  screen: Picture,
  masks: ReadonlyArray<Mask>,
  channels: ReadonlyArray<number>,
) =>
  channels.map((channel) => {
    const scored = diff(reference, screen, masks, channel);
    if (scored._tag === 'Sizes') return { channel, differing: -1, largest: -1 };
    return { channel, differing: scored.differing, largest: scored.largest };
  });

/**
 * The diff picture: the reference, the screen and the reference dimmed
 * with each differing pixel red and each masked one hatched, side by side.
 */
export const diffPicture = (reference: Picture, screen: Picture, scored: Scored): Picture => {
  const { width, height } = reference;
  const rgba = new Uint8Array(width * 3 * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const from = (y * width + x) * 4;
      const row = y * width * 3;
      rgba.set(reference.rgba.subarray(from, from + 4), (row + x) * 4);
      rgba.set(screen.rgba.subarray(from, from + 4), (row + width + x) * 4);
      const at = (row + 2 * width + x) * 4;
      const mark = scored.map[y * width + x];
      const grey = Math.round(
        ((reference.rgba[from] ?? 0) +
          (reference.rgba[from + 1] ?? 0) +
          (reference.rgba[from + 2] ?? 0)) /
          3,
      );
      const dim = 128 + (grey >> 1);
      let pixel = [dim, dim, dim];
      if (mark === 1) pixel = [255, 0, 0];
      if (mark === 2 && (x + y) % 12 < 4) pixel = [40, 40, 200];
      rgba.set([...pixel, 255], at);
    }
  return { width: width * 3, height, rgba };
};
