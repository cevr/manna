import { boilTick, grainShift } from '@manna/film/canvas';
import { hash2, labOf } from '@manna/film/core';

/** The share of a frame's pixels the film must draw as the verify rendered them (ΔE76 2 or less). */
export const PARITY = 0.995;

/** The furthest apart (ΔE76) two pixels may be and still count as drawn the same. */
const NEAR = 2;

/** A box of the frame, in px, that the parity leaves out (a drawing the film lays over a shot). */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The film's finish grain as `createFilm` lays it over every frame: its
 * overlay strength, its tile's side, how many tiles cycle on the boil tick,
 * and the first tile's seed (the paper's seed and 99; tile `k` adds 977 `k`).
 */
export interface FilmGrain {
  readonly strength: number;
  readonly size: number;
  readonly tiles: number;
  readonly seed: number;
}

/** What a film's `look` carries that its grain is made from. */
interface GrainLook {
  readonly paper: { readonly seed: number };
  readonly finish: {
    readonly grain: number;
    readonly grainSize: number;
    readonly grainTiles: number;
  };
}

/** The grain a film lays, read from its own look (`createFilm(...).look`), every default resolved there. */
export const grainOf = (look: GrainLook): FilmGrain => ({
  strength: look.finish.grain,
  size: look.finish.grainSize,
  tiles: look.finish.grainTiles,
  seed: look.paper.seed + 99,
});

/** Grain tiles already hashed, by side and seed: a tile is 65536 hashes, and every still reads one of six. */
const tiles = new Map<string, Uint8ClampedArray>();

/** One grain tile's grey values, `size` × `size`, hashed and clamped as the page's tile stores them (`grainTile`). */
const tileOf = (size: number, seed: number): Uint8ClampedArray => {
  const key = `${size} ${seed}`;
  const have = tiles.get(key);
  if (have !== undefined) return have;
  const tile = Uint8ClampedArray.from({ length: size * size }, (_, i) => hash2(i, seed) * 255);
  tiles.set(key, tile);
  return tile;
};

/** The canvas's `overlay` blend of source `s` over backdrop `b`, both 0..1. */
const overlay = (b: number, s: number): number => {
  if (b <= 0.5) return 2 * b * s;
  return 1 - 2 * (1 - b) * (1 - s);
};

/**
 * `rgb` (a `width` × `height` frame, three bytes a pixel) with the film's
 * grain laid over it as the page lays it at film second `t`: tick
 * `boilTick(t)` reads tile `tick mod tiles`, shifted by `grainShift`, and
 * overlays it at the grain's strength.
 */
export const grained = (
  rgb: ArrayLike<number>,
  width: number,
  height: number,
  grain: FilmGrain,
  t: number,
): Uint8ClampedArray => {
  const boil = boilTick(t);
  const tile = tileOf(grain.size, grain.seed + (boil % grain.tiles) * 977);
  const shift = grainShift([0, 0], boil, grain.size);
  const out = new Uint8ClampedArray(width * height * 3);
  for (let y = 0; y < height; y++) {
    const row = ((y + shift[1]) % grain.size) * grain.size;
    for (let x = 0; x < width; x++) {
      const s = (tile[row + ((x + shift[0]) % grain.size)] ?? 0) / 255;
      for (let c = 0; c < 3; c++) {
        const i = 3 * (y * width + x) + c;
        const b = (rgb[i] ?? 0) / 255;
        out[i] = 255 * ((1 - grain.strength) * b + grain.strength * overlay(b, s));
      }
    }
  }
  return out;
};

const covered = (boxes: ReadonlyArray<Box>, x: number, y: number) =>
  boxes.some((o) => x >= o.x && x < o.x + o.width && y >= o.y && y < o.y + o.height);

/** The share of two `width` × `height` RGB frames' pixels outside `boxes` within ΔE76 2 of each other. */
export const parity = (
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  width: number,
  height: number,
  boxes: ReadonlyArray<Box>,
): number => {
  let near = 0;
  let n = 0;
  for (let i = 0; i < width * height; i++) {
    if (covered(boxes, i % width, Math.floor(i / width))) continue;
    n++;
    const x = labOf([a[3 * i] ?? 0, a[3 * i + 1] ?? 0, a[3 * i + 2] ?? 0]);
    const y = labOf([b[3 * i] ?? 0, b[3 * i + 1] ?? 0, b[3 * i + 2] ?? 0]);
    if (Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) <= NEAR) near++;
  }
  return near / Math.max(1, n);
};
