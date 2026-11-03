import { Option } from 'effect';
import {
  components,
  deltaLab,
  dilate,
  figureMask,
  labPlane,
  median,
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

/** A flat box of a kept view: its box, its median Lab and its region. */
export interface Witness {
  readonly box: Box;
  readonly lab: Rgb;
  readonly region: number;
}

/** A kept view read for coverage: each pixel's Lab and region (-1 off every region), each region's first pixel, and every flat witness. */
export interface KeptPaint {
  readonly width: number;
  readonly height: number;
  readonly plane: Float32Array;
  readonly region: Int32Array;
  readonly firsts: ReadonlyArray<number>;
  readonly witnesses: ReadonlyArray<Witness>;
}

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

/** The per-channel median Lab of the pixels `at`, and whether every one lies within `PROBE_FLAT` of it (the probes' flatness rule). */
const flatOf = (plane: Float32Array, at: ReadonlyArray<number>): Option.Option<Rgb> => {
  const labs = at.map((i) => labOf(plane, i));
  return Option.filter(
    Option.all([
      median(labs.map((c) => c[0])),
      median(labs.map((c) => c[1])),
      median(labs.map((c) => c[2])),
    ]),
    (m) => labs.every((c) => deltaLab(c, m) <= PROBE_FLAT),
  );
};

/**
 * A kept view read for coverage. A region is a 4-connected component of the
 * figure's pixels that are not line ink, so the drawn lines split the parts.
 * A witness is a `WITNESS_SIDE` box on a `WITNESS_STRIDE` grid inside the
 * figure, `INK_CLEAR` px from line ink, every pixel within `PROBE_FLAT` of its
 * median: a flat paint a probe could read.
 */
export const keptPaint = (kept: Raster): KeptPaint => {
  const { width: w, height: h } = kept;
  const plane = labPlane(kept);
  const figure = figureMask(kept);
  const ink = new Uint8Array(w * h).map((_, i) => Number((plane[i * 3] ?? 0) < LINE_INK));
  const nearInk = dilate(ink, w, h, INK_CLEAR);
  const region = new Int32Array(w * h).fill(-1);
  const parts = components(w, h, (i) => figure[i] === 1 && ink[i] === 0);
  parts.forEach((pixels, k) => {
    for (const i of pixels) region[i] = k;
  });
  const witnesses: Array<Witness> = [];
  for (let y0 = 0; y0 + WITNESS_SIDE <= h; y0 += WITNESS_STRIDE)
    for (let x0 = 0; x0 + WITNESS_SIDE <= w; x0 += WITNESS_STRIDE) {
      const box = { x0, y0, x1: x0 + WITNESS_SIDE - 1, y1: y0 + WITNESS_SIDE - 1 };
      const at = indicesIn(box, w);
      if (!at.every((i) => figure[i] === 1 && nearInk[i] === 0)) continue;
      const flat = flatOf(plane, at);
      if (Option.isSome(flat))
        witnesses.push({ box, lab: flat.value, region: region[at[0] ?? 0] ?? -1 });
    }
  return {
    width: w,
    height: h,
    plane,
    region,
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
const probeReach = (
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

/**
 * The kept view with `from`'s colour painted `to`'s: every pixel of their
 * region within `PROBE_FLAT` of `from`'s seed and nearer it than `to`'s seed
 * takes the colour of `to`'s seed. Ink and the other regions stay.
 */
export const repaintCluster = (
  kept: Raster,
  paint: KeptPaint,
  from: Cluster,
  to: Cluster,
): Raster => {
  const rgba = kept.rgba.slice();
  const colour = seedRgb(kept, paint, to);
  for (let i = 0; i < paint.width * paint.height; i++) {
    if (paint.region[i] !== from.region) continue;
    const c = labOf(paint.plane, i);
    const d = deltaLab(c, from.seed.lab);
    if (d <= PROBE_FLAT && d < deltaLab(c, to.seed.lab)) rgba.set([...colour, 255], i * 4);
  }
  return { width: kept.width, height: kept.height, rgba };
};
