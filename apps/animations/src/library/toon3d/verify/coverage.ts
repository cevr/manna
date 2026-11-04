import { Option } from 'effect';
import {
  components,
  deltaLab,
  dilate,
  INK_LIGHTNESS,
  labPlane,
  pixel,
  PROBE_FLAT,
  type Box,
  type Raster,
  type Rgb,
} from './measures.ts';
import { probeBox, type ColourProbe, type CoverageExemption } from './probes.ts';

/** Line ink, for coverage: pixels darker than L* 17, the drawn line's core, so the hair's darkest paint (near L* 23) stays a paint with its own flat boxes. */
export const LINE_INK = 17;

/** A flat witness lies at least this far (px, either axis) from line ink. */
export const INK_CLEAR = 2;

/** A flat witness's side (px). */
export const WITNESS_SIDE = 4;

/** The grid step (px, both axes) of the witness enumeration. */
export const WITNESS_STRIDE = 2;

/** The colour bar (ΔE): a patch holds the witnesses within it of its seed, and a probe covers a patch when its kept median lies within it of a witness of the patch its box overlaps. */
export const COVER = 3;

/** A patch is repainted only to a colour more than this ΔE from every witness of it: a covering probe's kept median lies within `COVER` of one of them, so the repaint lies more than `COVER` from the probe's colour. */
export const REPAINT_APART = 2 * COVER;

/**
 * The area floor (px): a patch of fewer pixels is watercolour grain, exempt by
 * rule. 32 px is two witnesses side by side; the smallest shown paint of a
 * part the lead's reviewed probes mark holds a patch of 36 px, and each hand
 * shade of round 6's finding a patch of 52.
 */
export const PATCH_FLOOR = 32;

/** A flat box of a kept view: its box and its median Lab. */
export interface Witness {
  readonly box: Box;
  readonly lab: Rgb;
}

/** A kept view read for coverage: each pixel's Lab, every flat witness in reading order, and each witness's index by its grid cell. */
export interface KeptPaint {
  readonly width: number;
  readonly height: number;
  readonly plane: Float32Array;
  readonly witnesses: ReadonlyArray<Witness>;
  readonly grid: ReadonlyMap<number, number>;
}

/** The square of ΔE76 between pixel `i` of a plane and the Lab `c`. */
const offAt = (plane: Float32Array, i: number, c: Rgb): number => {
  const dl = (plane[i * 3] ?? 0) - c[0];
  const da = (plane[i * 3 + 1] ?? 0) - c[1];
  const db = (plane[i * 3 + 2] ?? 0) - c[2];
  return dl * dl + da * da + db * db;
};

/** The Lab of pixel `i` of a plane. */
const labOf = (plane: Float32Array, i: number): Rgb => [
  plane[i * 3] ?? 0,
  plane[i * 3 + 1] ?? 0,
  plane[i * 3 + 2] ?? 0,
];

/** The pixel indices of `box` in a `w`-wide picture, row by row. */
const indicesIn = (box: Box, w: number): ReadonlyArray<number> => {
  const out: Array<number> = [];
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) out.push(y * w + x);
  return out;
};

/** Whether every pixel of `box` is set in `mask`, and its L* spans at most twice `PROBE_FLAT`: a wider span leaves some pixel more than `PROBE_FLAT` from any median, so the box cannot be flat. */
const allClear = (mask: Uint8Array, plane: Float32Array, box: Box, w: number): boolean => {
  let lo = Infinity;
  let hi = -Infinity;
  for (let y = box.y0; y <= box.y1; y++)
    for (let x = box.x0; x <= box.x1; x++) {
      const i = y * w + x;
      if (mask[i] !== 1) return false;
      lo = Math.min(lo, plane[i * 3] ?? 0);
      hi = Math.max(hi, plane[i * 3] ?? 0);
    }
  return hi - lo <= 2 * PROBE_FLAT;
};

/** The per-channel median Lab of the pixels `at` (the upper middle, as `median`), when every one lies within `PROBE_FLAT` of it (the probes' flatness rule); none otherwise. `sorting` holds at least `at.length` values, sorted in place for each channel. */
const flatOf = (
  plane: Float32Array,
  at: ReadonlyArray<number>,
  sorting: Float64Array = new Float64Array(at.length),
): Option.Option<Rgb> => {
  const channel = (k: number): number => {
    const sorted = sorting.subarray(0, at.length);
    at.forEach((i, n) => {
      sorted[n] = plane[i * 3 + k] ?? 0;
    });
    sorted.sort();
    return sorted[at.length >> 1] ?? 0;
  };
  return Option.filter(
    Option.some<Rgb>([channel(0), channel(1), channel(2)]),
    (m) => at.length > 0 && at.every((i) => offAt(plane, i, m) <= PROBE_FLAT * PROBE_FLAT),
  );
};

/**
 * The pixels inside the figure's drawn outline: all but those the picture's
 * border reaches without crossing ink (`INK_LIGHTNESS`). The ground the feet
 * stand on, its cast shadow and the paper between the feet lie outside, as
 * the paper does.
 */
const insideOutline = (plane: Float32Array, w: number, h: number): Uint8Array => {
  const inside = new Uint8Array(w * h).fill(1);
  const onBorder = (i: number): boolean => {
    const x = i % w;
    return x === 0 || x === w - 1 || i < w || i >= w * (h - 1);
  };
  for (const pixels of components(w, h, (i) => (plane[i * 3] ?? 0) >= INK_LIGHTNESS))
    if (pixels.some(onBorder)) for (const i of pixels) inside[i] = 0;
  return inside;
};

/** The grid cell of a witness whose box starts at (x0, y0), in a `width`-wide picture. */
const cellOf = (width: number, x0: number, y0: number): number =>
  (y0 / WITNESS_STRIDE) * (Math.floor(width / WITNESS_STRIDE) + 1) + x0 / WITNESS_STRIDE;

/**
 * A kept view read for coverage. A witness is a `WITNESS_SIDE` box on a
 * `WITNESS_STRIDE` grid inside the outline, `INK_CLEAR` px from line ink,
 * every pixel within `PROBE_FLAT` of its median: a flat paint a probe could
 * read.
 */
export const keptPaint = (kept: Raster): KeptPaint => {
  const { width: w, height: h } = kept;
  const plane = labPlane(kept);
  const figure = insideOutline(plane, w, h);
  const ink = new Uint8Array(w * h).map((_, i) => Number((plane[i * 3] ?? 0) < LINE_INK));
  const nearInk = dilate(ink, w, h, INK_CLEAR);
  const clear = new Uint8Array(w * h).map((_, i) => Number(figure[i] === 1 && nearInk[i] === 0));
  const sorting = new Float64Array(WITNESS_SIDE * WITNESS_SIDE);
  const witnesses: Array<Witness> = [];
  const grid = new Map<number, number>();
  for (let y0 = 0; y0 + WITNESS_SIDE <= h; y0 += WITNESS_STRIDE)
    for (let x0 = 0; x0 + WITNESS_SIDE <= w; x0 += WITNESS_STRIDE) {
      const box = { x0, y0, x1: x0 + WITNESS_SIDE - 1, y1: y0 + WITNESS_SIDE - 1 };
      if (!allClear(clear, plane, box, w)) continue;
      const flat = flatOf(plane, indicesIn(box, w), sorting);
      if (Option.isNone(flat)) continue;
      grid.set(cellOf(w, x0, y0), witnesses.length);
      witnesses.push({ box, lab: flat.value });
    }
  return { width: w, height: h, plane, witnesses, grid };
};

/** The indices of the witnesses whose boxes share a pixel with `box`. */
const witnessesOver = (paint: KeptPaint, box: Box): ReadonlyArray<number> => {
  const out: Array<number> = [];
  const first = (v: number): number =>
    Math.max(0, Math.ceil((v - WITNESS_SIDE + 1) / WITNESS_STRIDE) * WITNESS_STRIDE);
  for (let y0 = first(box.y0); y0 <= box.y1; y0 += WITNESS_STRIDE)
    for (let x0 = first(box.x0); x0 <= box.x1; x0 += WITNESS_STRIDE)
      Option.map(Option.fromUndefinedOr(paint.grid.get(cellOf(paint.width, x0, y0))), (k) =>
        out.push(k),
      );
  return out;
};

/** The box a witness's box overlaps or touches: its own grown by one pixel on each side. */
const touchBox = (w: Witness): Box => ({
  x0: w.box.x0 - 1,
  y0: w.box.y0 - 1,
  x1: w.box.x1 + 1,
  y1: w.box.y1 + 1,
});

/**
 * A flat patch of a kept view: one area of one flat colour. Its seed is the
 * witness, of those no earlier patch holds, with the most witnesses within
 * `COVER` of it among those its box overlaps or touches (the first in reading
 * order of equals), so a seed lies inside its paint, not on its edge. The
 * patch grows box to box through witnesses whose boxes overlap or touch one
 * it holds, taking each whose median lies within `COVER` of the seed's, so a
 * slow gradient is cut into patches no wider than the bar. Its pixels are its
 * witnesses' boxes.
 */
export interface Patch {
  readonly seed: Witness;
  readonly witnesses: ReadonlyArray<Witness>;
  readonly pixels: ReadonlyArray<number>;
}

/** A kept view's flat patches, in the order of their seeds. */
export const patchesOf = (paint: KeptPaint): ReadonlyArray<Patch> => {
  const { witnesses } = paint;
  const touching = witnesses.map((v, k) =>
    witnessesOver(paint, touchBox(v)).filter((n) => n !== k),
  );
  const alike = witnesses.map(
    (v, k) =>
      (touching[k] ?? []).filter((n) => deltaLab(v.lab, witnesses[n]?.lab ?? v.lab) <= COVER)
        .length,
  );
  const order = witnesses
    .map((_, k) => k)
    .toSorted((a, b) => (alike[b] ?? 0) - (alike[a] ?? 0) || a - b);
  const held = new Uint8Array(witnesses.length);
  return order.flatMap((k) =>
    Option.match(
      Option.filter(Option.fromUndefinedOr(witnesses[k]), () => held[k] !== 1),
      {
        onNone: (): ReadonlyArray<Patch> => [],
        onSome: (seed) => grow(paint, touching, held, k, seed),
      },
    ),
  );
};

/** The patch `patchesOf` grows from the seed witness `k`, holding each witness it takes in `held`. */
const grow = (
  paint: KeptPaint,
  touching: ReadonlyArray<ReadonlyArray<number>>,
  held: Uint8Array,
  k: number,
  seed: Witness,
): ReadonlyArray<Patch> => {
  const { witnesses, width: w } = paint;
  held[k] = 1;
  const members: Array<number> = [k];
  for (let q = 0; q < members.length; q++)
    for (const n of touching[members[q] ?? k] ?? []) {
      if (held[n] === 1 || deltaLab(seed.lab, witnesses[n]?.lab ?? seed.lab) > COVER) continue;
      held[n] = 1;
      members.push(n);
    }
  const taken = members
    .toSorted((a, b) => a - b)
    .flatMap((n) => Option.toArray(Option.fromUndefinedOr(witnesses[n])));
  const pixels = new Set<number>();
  for (const v of taken) for (const i of indicesIn(v.box, w)) pixels.add(i);
  return [{ seed, witnesses: taken, pixels: [...pixels].toSorted((a, b) => a - b) }];
};

/** What a probe reads in the kept view for coverage: its box and its median Lab; none when it leaves the picture or is not flat. */
export const probeReach = (
  paint: KeptPaint,
  probe: ColourProbe,
): Option.Option<{ readonly box: Box; readonly lab: Rgb }> => {
  const box = probeBox(probe);
  if (box.x0 < 0 || box.y0 < 0 || box.x1 >= paint.width || box.y1 >= paint.height)
    return Option.none();
  return Option.map(flatOf(paint.plane, indicesIn(box, paint.width)), (lab) => ({ box, lab }));
};

/** Each patch's covering probes: those whose box overlaps a witness of the patch whose median lies within `COVER` of the probe's kept median. A probe never covers a patch it does not touch. */
export const coverOf = (
  paint: KeptPaint,
  patches: ReadonlyArray<Patch>,
  probes: ReadonlyArray<ColourProbe>,
): ReadonlyArray<ReadonlyArray<ColourProbe>> => {
  const home = new Map<Witness, number>();
  patches.forEach((p, k) => {
    for (const v of p.witnesses) home.set(v, k);
  });
  const by = patches.map((): Array<ColourProbe> => []);
  for (const probe of probes)
    Option.map(probeReach(paint, probe), ({ box, lab }) => {
      const reached = new Set<number>();
      for (const n of witnessesOver(paint, box))
        Option.map(
          Option.flatMap(
            Option.filter(
              Option.fromUndefinedOr(paint.witnesses[n]),
              (v) => deltaLab(v.lab, lab) <= COVER,
            ),
            (v) => Option.fromUndefinedOr(home.get(v)),
          ),
          (k) => reached.add(k),
        );
      for (const k of reached) by[k]?.push(probe);
    });
  return by;
};

/** Whether an exemption names a patch: its pixel `at` lies in a witness of the patch whose median lies within `COVER` of the exemption's colour. */
export const exemptsPatch = (patch: Patch, e: CoverageExemption): boolean => {
  const [x, y] = e.at;
  return patch.witnesses.some(
    (v) =>
      x >= v.box.x0 &&
      x <= v.box.x1 &&
      y >= v.box.y0 &&
      y <= v.box.y1 &&
      deltaLab(v.lab, e.lab) <= COVER,
  );
};

/** Each patch of at least `floor` px that no probe covers and no exemption names. */
export const uncoveredPatches = (
  paint: KeptPaint,
  patches: ReadonlyArray<Patch>,
  probes: ReadonlyArray<ColourProbe>,
  exempt: ReadonlyArray<CoverageExemption>,
  floor: number,
): ReadonlyArray<Patch> => {
  const cover = coverOf(paint, patches, probes);
  return patches.filter(
    (patch, k) =>
      patch.pixels.length >= floor &&
      (cover[k] ?? []).length === 0 &&
      !exempt.some((e) => exemptsPatch(patch, e)),
  );
};

/** A box as `[x, y, w, h]`. */
const boxText = (b: Box): string => `[${b.x0}, ${b.y0}, ${b.x1 - b.x0 + 1}, ${b.y1 - b.y0 + 1}]`;

/** The bounds of a patch's pixels. */
export const patchBounds = (paint: KeptPaint, patch: Patch): Box => {
  const xs = patch.pixels.map((i) => i % paint.width);
  const ys = patch.pixels.map((i) => Math.floor(i / paint.width));
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
};

/** A patch as the coverage test names it: its seed's box and Lab, its area and its bounds. */
export const patchText = (paint: KeptPaint, patch: Patch): string =>
  `patch ${boxText(patch.seed.box)} Lab ${patch.seed.lab.map((v) => v.toFixed(1)).join(' ')} area ${patch.pixels.length} bounds ${boxText(patchBounds(paint, patch))}`;

/** The pixel of a witness's box nearest its median, as sRGB bytes. */
const witnessRgb = (kept: Raster, paint: KeptPaint, w: Witness): Rgb => {
  const off = (i: number): number => deltaLab(labOf(paint.plane, i), w.lab);
  const at = indicesIn(w.box, paint.width).toSorted((a, b) => off(a) - off(b));
  return pixel(kept, at[0] ?? 0);
};

/** The colour a repaint of patch `k` lays: the seed colour (as sRGB bytes, its seed box's pixel nearest its median) of the patch whose seed lies nearest `k`'s seed in the picture, of those whose seed colour lies more than `apart` from every witness of `k`; none when no patch's does. */
export const repaintColour = (
  kept: Raster,
  paint: KeptPaint,
  patches: ReadonlyArray<Patch>,
  k: number,
  apart: number,
): Option.Option<Rgb> =>
  Option.flatMap(Option.fromUndefinedOr(patches[k]), (from) => {
    const far = (to: Patch): boolean =>
      from.witnesses.every((v) => deltaLab(v.lab, to.seed.lab) > apart);
    const gap = (to: Patch): number =>
      Math.hypot(to.seed.box.x0 - from.seed.box.x0, to.seed.box.y0 - from.seed.box.y0);
    return Option.map(
      Option.fromUndefinedOr(
        patches
          .filter((to, n) => n !== k)
          .toSorted((a, b) => gap(a) - gap(b))
          .find(far),
      ),
      (to) => witnessRgb(kept, paint, to.seed),
    );
  });

/** A kept view's patch repaint: the view with one patch's pixels, and no other, painted `colour`. The repaints share one buffer, each undoing the last: a repaint's raster holds until the next repaint. */
export const patchRepainter = (kept: Raster): ((patch: Patch, colour: Rgb) => Raster) => {
  const rgba = kept.rgba.slice();
  let last: ReadonlyArray<number> = [];
  return (patch, colour) => {
    for (const i of last) for (let k = i * 4; k < i * 4 + 4; k++) rgba[k] = kept.rgba[k] ?? 0;
    for (const i of patch.pixels) rgba.set([...colour, 255], i * 4);
    last = patch.pixels;
    return { width: kept.width, height: kept.height, rgba };
  };
};
