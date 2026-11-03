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

/** A flat witness's side (px), and the grid step on which witnesses are enumerated. */
export const WITNESS_SIDE = 4;

/** The grid step (px, both axes) of the witness enumeration. */
export const WITNESS_STRIDE = 2;

/** A witness is covered by a probe of its region whose kept median lies within this ΔE of the witness's: the colour bar. */
export const COVER = 3;

/** A cluster is repainted only to a colour more than this ΔE from its seed: a colour within it shares with the seed a probe colour within the bar of both, so the bar need not see the repaint. */
export const REPAINT_APART = 2 * COVER;

/** A flat box of a kept view: its box, its median Lab and its region. */
export interface Witness {
  readonly box: Box;
  readonly lab: Rgb;
  readonly region: number;
}

/** A kept view read for coverage: each pixel's Lab and region (-1 off every region), each region's pixels and first pixel, and every flat witness. */
export interface KeptPaint {
  readonly width: number;
  readonly height: number;
  readonly plane: Float32Array;
  readonly region: Int32Array;
  readonly members: ReadonlyArray<ReadonlyArray<number>>;
  readonly firsts: ReadonlyArray<number>;
  readonly witnesses: ReadonlyArray<Witness>;
}

/** The Lab of pixel `i` of a plane. */
const labOf = (plane: Float32Array, i: number): Rgb => [
  plane[i * 3] ?? 0,
  plane[i * 3 + 1] ?? 0,
  plane[i * 3 + 2] ?? 0,
];

/** The square of ΔE76 between pixel `i` of a plane and the Lab `c`. */
const offAt = (plane: Float32Array, i: number, c: Rgb): number => {
  const dl = (plane[i * 3] ?? 0) - c[0];
  const da = (plane[i * 3 + 1] ?? 0) - c[1];
  const db = (plane[i * 3 + 2] ?? 0) - c[2];
  return dl * dl + da * da + db * db;
};

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

/**
 * A kept view read for coverage. A region is a 4-connected component of the
 * pixels inside the figure's outline that are not line ink, so the drawn
 * lines split the parts. A witness is a `WITNESS_SIDE` box on a
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
  const region = new Int32Array(w * h).fill(-1);
  const parts = components(w, h, (i) => figure[i] === 1 && ink[i] === 0);
  parts.forEach((pixels, k) => {
    for (const i of pixels) region[i] = k;
  });
  const clear = new Uint8Array(w * h).map((_, i) => Number(figure[i] === 1 && nearInk[i] === 0));
  const sorting = new Float64Array(WITNESS_SIDE * WITNESS_SIDE);
  const witnesses: Array<Witness> = [];
  for (let y0 = 0; y0 + WITNESS_SIDE <= h; y0 += WITNESS_STRIDE)
    for (let x0 = 0; x0 + WITNESS_SIDE <= w; x0 += WITNESS_STRIDE) {
      const box = { x0, y0, x1: x0 + WITNESS_SIDE - 1, y1: y0 + WITNESS_SIDE - 1 };
      if (!allClear(clear, plane, box, w)) continue;
      const flat = flatOf(plane, indicesIn(box, w), sorting);
      if (Option.isSome(flat))
        witnesses.push({ box, lab: flat.value, region: region[y0 * w + x0] ?? -1 });
    }
  return {
    width: w,
    height: h,
    plane,
    region,
    members: parts,
    firsts: parts.map((pixels) => pixels[0] ?? 0),
    witnesses,
  };
};

/** A region's name: its first pixel in reading order, as `x,y`. */
export const regionName = (paint: KeptPaint, region: number): string => {
  const first = paint.firsts[region] ?? 0;
  return `${first % paint.width},${Math.floor(first / paint.width)}`;
};

/** What a probe reads in the kept view for coverage: the regions its box lies in and its median Lab; none when it leaves the picture or is not flat. */
export const probeReach = (
  paint: KeptPaint,
  probe: ColourProbe,
): Option.Option<{ readonly regions: ReadonlySet<number>; readonly lab: Rgb }> => {
  const box = probeBox(probe);
  if (box.x0 < 0 || box.y0 < 0 || box.x1 >= paint.width || box.y1 >= paint.height)
    return Option.none();
  const at = indicesIn(box, paint.width);
  return Option.map(flatOf(paint.plane, at), (lab) => ({
    regions: new Set(at.map((i) => paint.region[i] ?? -1)),
    lab,
  }));
};

/** Each witness no probe covers and no exemption lets go: no probe of its region has a kept median within `COVER` of it, and no exemption of its region names a colour within `COVER` of it. */
export const uncovered = (
  paint: KeptPaint,
  probes: ReadonlyArray<ColourProbe>,
  exempt: ReadonlyArray<CoverageExemption>,
): ReadonlyArray<Witness> => {
  const reach = probes.flatMap((probe) => Option.toArray(probeReach(paint, probe)));
  const lets = exempt.map((e) => ({
    region: paint.region[e.at[1] * paint.width + e.at[0]] ?? -1,
    lab: e.lab,
  }));
  return paint.witnesses.filter(
    (w) =>
      !reach.some((p) => p.regions.has(w.region) && deltaLab(p.lab, w.lab) <= COVER) &&
      !lets.some((e) => e.region === w.region && deltaLab(e.lab, w.lab) <= COVER),
  );
};

/** A witness as the coverage test names it: its region, its box as `[x, y, w, h]` and its Lab. */
export const witnessText = (paint: KeptPaint, w: Witness): string =>
  `region ${regionName(paint, w.region)} [${w.box.x0}, ${w.box.y0}, ${WITNESS_SIDE}, ${WITNESS_SIDE}] Lab ${w.lab.map((v) => v.toFixed(1)).join(' ')}`;

/** One colour of one region: the witnesses within `COVER` of its seed, the first witness of that colour in reading order. */
export interface Cluster {
  readonly region: number;
  readonly seed: Witness;
  readonly witnesses: ReadonlyArray<Witness>;
}

/** A kept view's witness clusters: each witness joins the first cluster of its region whose seed lies within `COVER` of it, else seeds a new one, so the seeds of a region lie more than `COVER` apart. */
export const clustersOf = (paint: KeptPaint): ReadonlyArray<Cluster> => {
  const out: Array<{ region: number; seed: Witness; witnesses: Array<Witness> }> = [];
  for (const w of paint.witnesses) {
    Option.match(
      Option.fromUndefinedOr(
        out.find((c) => c.region === w.region && deltaLab(c.seed.lab, w.lab) <= COVER),
      ),
      {
        onNone: () => out.push({ region: w.region, seed: w, witnesses: [w] }),
        onSome: (home) => home.witnesses.push(w),
      },
    );
  }
  return out;
};

/** The pixel of a cluster's seed box nearest its median, as sRGB bytes: the colour a repaint lays. */
const seedRgb = (kept: Raster, paint: KeptPaint, c: Cluster): Rgb => {
  const off = (i: number): number => deltaLab(labOf(paint.plane, i), c.seed.lab);
  const at = indicesIn(c.seed.box, paint.width).toSorted((a, b) => off(a) - off(b));
  return pixel(kept, at[0] ?? 0);
};

/** Each cluster that shares its region with another whose seed lies more than `apart` from its own, paired with the nearest such in colour: the paint a repaint of it lays. */
export const repaintPairs = (
  clusters: ReadonlyArray<Cluster>,
  apart: number,
): ReadonlyArray<{ readonly from: Cluster; readonly to: Cluster }> =>
  clusters.flatMap((from) =>
    clusters
      .filter((to) => to.region === from.region)
      .map((to) => ({ to, d: deltaLab(to.seed.lab, from.seed.lab) }))
      .filter(({ d }) => d > apart)
      .toSorted((a, b) => a.d - b.d)
      .slice(0, 1)
      .map(({ to }) => ({ from, to })),
  );

/**
 * A kept view's cluster repaint: the view with `from`'s colour painted `to`'s.
 * Every pixel of their region within `PROBE_FLAT` of `from`'s seed and nearer
 * it than `to`'s seed takes the colour of `to`'s seed; ink and the other
 * regions stay. Each region's pixels are bucketed by whole L* once, so a
 * repaint reads only the buckets within `PROBE_FLAT` of the seed's L*. The
 * repaints share one buffer, each undoing the last: a repaint's raster holds
 * until the next repaint.
 */
export const repainter = (
  kept: Raster,
  paint: KeptPaint,
): ((from: Cluster, to: Cluster) => Raster) => {
  const buckets = paint.members.map((pixels) => byLightness(paint.plane, pixels));
  const rgba = kept.rgba.slice();
  let last: ReadonlyArray<number> = [];
  return (from, to) => {
    for (const i of last) for (let k = i * 4; k < i * 4 + 4; k++) rgba[k] = kept.rgba[k] ?? 0;
    last = Option.match(Option.fromUndefinedOr(buckets[from.region]), {
      onNone: () => [],
      onSome: (bucketed) => repaintCluster(rgba, kept, paint, bucketed, from, to),
    });
    return { width: kept.width, height: kept.height, rgba };
  };
};

/** A region's pixels in buckets of whole L* (0 to 100): bucket `l` is `pixels[starts[l]]` up to `pixels[starts[l + 1]]`. */
interface Bucketed {
  readonly pixels: Int32Array;
  readonly starts: Int32Array;
}

/** Whole L* of pixel `i`, within 0 to 100. */
const bucketOf = (plane: Float32Array, i: number): number =>
  Math.min(100, Math.max(0, Math.floor(plane[i * 3] ?? 0)));

/** `pixels` bucketed by whole L*, by a counting sort. */
const byLightness = (plane: Float32Array, pixels: ReadonlyArray<number>): Bucketed => {
  const starts = new Int32Array(102);
  for (const i of pixels)
    starts[bucketOf(plane, i) + 1] = (starts[bucketOf(plane, i) + 1] ?? 0) + 1;
  for (let l = 1; l < 102; l++) starts[l] = (starts[l] ?? 0) + (starts[l - 1] ?? 0);
  const next = starts.slice();
  const out = new Int32Array(pixels.length);
  for (const i of pixels) {
    const l = bucketOf(plane, i);
    out[next[l] ?? 0] = i;
    next[l] = (next[l] ?? 0) + 1;
  }
  return { pixels: out, starts };
};

/** `repainter`'s repaint into `rgba` over the region's bucketed pixels; the pixels it painted. */
const repaintCluster = (
  rgba: Uint8Array,
  kept: Raster,
  paint: KeptPaint,
  { pixels, starts }: Bucketed,
  from: Cluster,
  to: Cluster,
): ReadonlyArray<number> => {
  const colour = [...seedRgb(kept, paint, to), 255];
  const lo = Math.max(0, Math.floor(from.seed.lab[0] - PROBE_FLAT));
  const hi = Math.min(100, Math.floor(from.seed.lab[0] + PROBE_FLAT));
  const painted: Array<number> = [];
  for (let k = starts[lo] ?? 0; k < (starts[hi + 1] ?? 0); k++) {
    const i = pixels[k] ?? 0;
    const d = offAt(paint.plane, i, from.seed.lab);
    if (d <= PROBE_FLAT * PROBE_FLAT && d < offAt(paint.plane, i, to.seed.lab)) {
      rgba.set(colour, i * 4);
      painted.push(i);
    }
  }
  return painted;
};
