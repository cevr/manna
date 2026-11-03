import { Option } from 'effect';
import { IDS_PASS } from '../ids.ts';

/** A picture as RGBA bytes, row by row. */
export interface Raster {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

/** A colour in sRGB bytes, or a CIE Lab triple. */
export type Rgb = readonly [number, number, number];

/** A pixel box, every edge inclusive. */
export interface Box {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** A point in a picture's pixels. */
export type Point = readonly [x: number, y: number];

/** `#rrggbb` as bytes. */
export const rgbOf = (hex: string): Rgb => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** The bytes of pixel `i`. */
export const pixel = (r: Raster, i: number): Rgb => [
  r.rgba[i * 4] ?? 0,
  r.rgba[i * 4 + 1] ?? 0,
  r.rgba[i * 4 + 2] ?? 0,
];

const linear = (v: number): number => {
  const c = v / 255;
  if (c <= 0.04045) return c / 12.92;
  return ((c + 0.055) / 1.055) ** 2.4;
};

const labF = (t: number): number => {
  if (t > 216 / 24389) return Math.cbrt(t);
  return ((24389 / 27) * t + 16) / 116;
};

/** sRGB bytes in CIE Lab (D65). */
export const lab = (c: Rgb): Rgb => {
  const r = linear(c[0]);
  const g = linear(c[1]);
  const b = linear(c[2]);
  const fx = labF((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const fy = labF(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const fz = labF((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

/** ΔE76 between two Lab triples. */
export const deltaLab = (p: Rgb, q: Rgb): number =>
  Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

/** ΔE76 between two sRGB colours. */
export const deltaE = (a: Rgb, b: Rgb): number => deltaLab(lab(a), lab(b));

/** Every pixel's Lab, three floats a pixel, so a measure converts each pixel once. */
export const labPlane = (r: Raster): Float32Array => {
  const out = new Float32Array(r.width * r.height * 3);
  for (let i = 0; i < r.width * r.height; i++) {
    const l = lab(pixel(r, i));
    out[i * 3] = l[0];
    out[i * 3 + 1] = l[1];
    out[i * 3 + 2] = l[2];
  }
  return out;
};

const labAt = (plane: Float32Array, i: number): Rgb => [
  plane[i * 3] ?? 0,
  plane[i * 3 + 1] ?? 0,
  plane[i * 3 + 2] ?? 0,
];

/** The middle value of `xs` (the upper middle when even); none when empty. */
export const median = (xs: ReadonlyArray<number>): Option.Option<number> => {
  const sorted = [...xs].sort((a, b) => a - b);
  return Option.fromUndefinedOr(sorted[sorted.length >> 1]);
};

/** The four in-picture neighbours of pixel `i`. */
const around = (i: number, w: number, h: number): ReadonlyArray<number> => {
  const x = i % w;
  const out: Array<number> = [];
  if (x > 0) out.push(i - 1);
  if (x < w - 1) out.push(i + 1);
  if (i >= w) out.push(i - w);
  if (i < w * (h - 1)) out.push(i + w);
  return out;
};

/** The 4-connected components of the pixels `keep` holds, each as its pixel indices. */
export const components = (
  w: number,
  h: number,
  keep: (i: number) => boolean,
): ReadonlyArray<ReadonlyArray<number>> => {
  const seen = new Uint8Array(w * h);
  const out: Array<Array<number>> = [];
  for (let s = 0; s < w * h; s++) {
    if (seen[s] === 1 || !keep(s)) continue;
    seen[s] = 1;
    const stack = [s];
    const pixels: Array<number> = [];
    while (stack.length > 0) {
      const i = stack.pop() ?? 0;
      pixels.push(i);
      for (const j of around(i, w, h)) {
        if (seen[j] === 1 || !keep(j)) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    out.push(pixels);
  }
  return out;
};

/** The paper behind a picture: each channel's median over its four corners' 6 × 6 patches. */
export const paperOf = (r: Raster): Rgb => {
  const channels: [Array<number>, Array<number>, Array<number>] = [[], [], []];
  for (const [cx, cy] of [
    [0, 0],
    [r.width - 6, 0],
    [0, r.height - 6],
    [r.width - 6, r.height - 6],
  ] as const)
    for (let y = cy; y < cy + 6; y++)
      for (let x = cx; x < cx + 6; x++) {
        const c = pixel(r, y * r.width + x);
        channels[0].push(c[0]);
        channels[1].push(c[1]);
        channels[2].push(c[2]);
      }
  const at = (k: 0 | 1 | 2): number => Option.getOrElse(median(channels[k]), () => 0);
  return [at(0), at(1), at(2)];
};

/**
 * The figure's pixels: all but the paper reached from the border. The paper
 * floods over pixels within ΔE 12 of it and stops at the figure's ink, so a
 * tunic as pale as the paper still counts as figure.
 */
export const figureMask = (r: Raster): Uint8Array => {
  const paper = lab(paperOf(r));
  const plane = labPlane(r);
  const { width: w, height: h } = r;
  const near = (i: number): boolean => deltaLab(labAt(plane, i), paper) < 12;
  const bg = new Uint8Array(w * h);
  const stack: Array<number> = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length > 0) {
    const i = stack.pop() ?? 0;
    if (bg[i] === 1 || !near(i)) continue;
    bg[i] = 1;
    stack.push(...around(i, w, h));
  }
  return bg.map((b) => 1 - b);
};

/** Intersection over union of two masks of one size. */
export const iou = (a: Uint8Array, b: Uint8Array): number => {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === 1 || b[i] === 1) union++;
    if (a[i] === 1 && b[i] === 1) inter++;
  }
  return inter / Math.max(1, union);
};

/** The box round a mask's pixels; none when it holds none. */
export const boxOf = (mask: Uint8Array, w: number): Option.Option<Box> => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] !== 1) continue;
    const x = i % w;
    const y = Math.floor(i / w);
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  if (x1 < 0) return Option.none();
  return Option.some({ x0, y0, x1, y1 });
};

/** The whole picture as a box. */
export const wholeBox = (r: Raster): Box => ({ x0: 0, y0: 0, x1: r.width - 1, y1: r.height - 1 });

/** A part id from the ids pass (`IDS_PASS`: id × 12 in red). */
export const idAt = (ids: Raster, i: number): number =>
  Math.round((ids.rgba[i * 4] ?? 0) / IDS_PASS.idStep);

/** A view depth (heads) as the ids pass's green level (`IDS_PASS`). */
export const depthCode = (depth: number): number =>
  Math.min(255, Math.max(0, Math.round((depth - IDS_PASS.depthFrom) * IDS_PASS.depthLevels)));

/** A pixel's view depth (heads) from the ids pass. */
export const depthAt = (ids: Raster, i: number): number =>
  IDS_PASS.depthFrom + (ids.rgba[i * 4 + 1] ?? 0) / IDS_PASS.depthLevels;

/** A depth step (heads) wider than this between neighbours of one part is a fold, the part lying over itself; the ink pass lines the same step (`uGap`). */
export const FOLD_GAP = 0.05;

/** Ink: pixels darker than L* 24 (the drawn ink sits near L* 12; the darkest paint, the hair's shade, near L* 30). */
export const INK_LIGHTNESS = 24;

/** Each pixel's ink flag, 1 where L* is under `INK_LIGHTNESS`. */
export const inkMask = (r: Raster): Uint8Array => {
  const plane = labPlane(r);
  const out = new Uint8Array(r.width * r.height);
  for (let i = 0; i < out.length; i++) out[i] = Number((plane[i * 3] ?? 100) < INK_LIGHTNESS);
  return out;
};

/** Over every `step`-th ink pixel in `box` (both axes), the shortest ink run through it along a row, a column or a diagonal (a diagonal step counts √2). */
const shortRuns = (r: Raster, box: Box, step: number): ReadonlyArray<number> => {
  const ink = inkMask(r);
  const { width: w, height: h } = r;
  const isInk = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < w && y < h && ink[y * w + x] === 1;
  const run = (x: number, y: number, dx: number, dy: number): number => {
    let n = 1;
    for (const s of [1, -1]) {
      let k = 1;
      while (isInk(x + dx * s * k, y + dy * s * k)) k++;
      n += k - 1;
    }
    return n * Math.hypot(dx, dy);
  };
  const runs: Array<number> = [];
  for (let y = box.y0; y <= box.y1; y += step)
    for (let x = box.x0; x <= box.x1; x += step) {
      if (!isInk(x, y)) continue;
      runs.push(Math.min(run(x, y, 1, 0), run(x, y, 0, 1), run(x, y, 1, 1), run(x, y, 1, -1)));
    }
  return runs;
};

/** The ink's width: the median of the shortest runs through every second ink pixel in `box`, in whole pixels. */
export const inkWidth = (r: Raster, box: Box): number =>
  Option.getOrElse(median(shortRuns(r, box, 2)), () => 0);

/**
 * The ink's stroke width to a fraction of a pixel: the shortest runs through
 * every ink pixel in `box`, averaged over their middle half. A line whose
 * edges fall between pixels runs some rows a pixel wider than others, so the
 * mean sees the fraction a median rounds away, and a drift of 15 % is not a
 * whole-pixel step; 0 when the box holds no ink.
 */
export const strokeWidth = (r: Raster, box: Box): number => {
  const sorted = [...shortRuns(r, box, 1)].sort((a, b) => a - b);
  const mid = sorted.slice(Math.floor(sorted.length / 4), Math.ceil((sorted.length * 3) / 4));
  return mid.reduce((s, x) => s + x, 0) / Math.max(1, mid.length);
};

/** The ink's colour: the per-channel median Lab over core ink pixels (ink with all eight neighbours ink); none when there are none. */
export const inkColour = (r: Raster): Option.Option<Rgb> => {
  const ink = inkMask(r);
  const plane = labPlane(r);
  const { width: w, height: h } = r;
  const ls: [Array<number>, Array<number>, Array<number>] = [[], [], []];
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      let core = true;
      for (let dy = -1; dy <= 1 && core; dy++)
        for (let dx = -1; dx <= 1; dx++) core = core && ink[(y + dy) * w + x + dx] === 1;
      if (!core) continue;
      const c = labAt(plane, y * w + x);
      ls[0].push(c[0]);
      ls[1].push(c[1]);
      ls[2].push(c[2]);
    }
  return Option.all([median(ls[0]), median(ls[1]), median(ls[2])]);
};

/** Non-ink pixels in `box` with ink within 3 px on both sides along a row or a column: two lines drawn where one should be. */
export const doubledInk = (r: Raster, box: Box): number => {
  const ink = inkMask(r);
  const { width: w, height: h } = r;
  const near = (x: number, y: number, dx: number, dy: number): boolean => {
    for (let k = 1; k <= 3; k++) {
      const X = x + dx * k;
      const Y = y + dy * k;
      if (X < 0 || Y < 0 || X >= w || Y >= h) return false;
      if (ink[Y * w + X] === 1) return true;
    }
    return false;
  };
  let n = 0;
  for (let y = box.y0; y <= box.y1; y++)
    for (let x = box.x0; x <= box.x1; x++) {
      if (ink[y * w + x] === 1) continue;
      if ((near(x, y, 1, 0) && near(x, y, -1, 0)) || (near(x, y, 0, 1) && near(x, y, 0, -1))) n++;
    }
  return n;
};

/**
 * Background pixels (ids `background` holds) the figure encloses, in
 * components under 64 px, that show in the finished `colour` frame: tears
 * and pin holes. Ground the ink covers (the sliver between a hem and two
 * rounded feet) is not seen, so it is no tear.
 */
export const tears = (ids: Raster, colour: Raster, background: (id: number) => boolean): number => {
  const { width: w, height: h } = ids;
  const ink = inkMask(colour);
  const onEdge = (i: number): boolean => {
    const x = i % w;
    const y = Math.floor(i / w);
    return x === 0 || y === 0 || x === w - 1 || y === h - 1;
  };
  return components(w, h, (i) => background(idAt(ids, i)))
    .filter((c) => c.length < 64 && !c.some(onEdge))
    .reduce((sum, c) => sum + c.filter((i) => ink[i] === 0).length, 0);
};

/**
 * A part's width across its bone: at each of `fractions` along the segment
 * `from` → `to` (pixel centres), the run of pixels of id `part` along the
 * segment's normal through that point, and the median run. Measured across
 * the bone's projected axis, a tube keeps its width however far it turns
 * toward the camera. A run ends where the depth steps by more than
 * `FOLD_GAP`, so a forearm folded over its own upper arm reads its own
 * width, not both. None when the segment is under 4 px long or no sample
 * lands in the part.
 */
export const widthAcross = (
  ids: Raster,
  part: number,
  segment: readonly [from: Point, to: Point],
  fractions: ReadonlyArray<number>,
): Option.Option<number> => {
  const [from, to] = segment;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  if (length < 4) return Option.none();
  const nx = -dy / length;
  const ny = dx / length;
  const pixel = (x: number, y: number): Option.Option<number> => {
    const X = Math.floor(x);
    const Y = Math.floor(y);
    if (X < 0 || Y < 0 || X >= ids.width || Y >= ids.height) return Option.none();
    const i = Y * ids.width + X;
    if (idAt(ids, i) !== part) return Option.none();
    return Option.some(i);
  };
  const step = 0.25;
  /** Steps from the centre along (sx, sy) while the part goes on, with no fold between neighbours. */
  const reach = (cx: number, cy: number, sx: number, sy: number, start: number): number => {
    let at = start;
    let k = 1;
    for (;;) {
      const next = pixel(cx + sx * k * step, cy + sy * k * step);
      if (Option.isNone(next)) return k;
      if (Math.abs(depthAt(ids, next.value) - depthAt(ids, at)) > FOLD_GAP) return k;
      at = next.value;
      k++;
    }
  };
  const runs: Array<number> = [];
  for (const f of fractions) {
    const cx = from[0] + dx * f;
    const cy = from[1] + dy * f;
    const centre = pixel(cx, cy);
    if (Option.isNone(centre)) continue;
    const k = reach(cx, cy, nx, ny, centre.value);
    const j = reach(cx, cy, -nx, -ny, centre.value);
    runs.push((k + j - 1) * step);
  }
  return median(runs);
};

/** The paints a part may show: its base and its shade, plus any region paint (the sandal on a foot). */
export type PartPaints = ReadonlyMap<number, ReadonlyArray<Rgb>>;

/**
 * A part's interior: its pixels in the ids pass whose 3 × 3 neighbourhood is
 * all that part and holds no ink in the colour frame, so the ink and the one
 * soft pixel the downsample leaves beside it are not read as the fill.
 */
export const interiorOf = (colour: Raster, ids: Raster, part: number): ReadonlyArray<number> => {
  const ink = inkMask(colour);
  const { width: w, height: h } = ids;
  const out: Array<number> = [];
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      let inside = true;
      for (let dy = -1; dy <= 1 && inside; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const j = (y + dy) * w + x + dx;
          inside = inside && ink[j] === 0 && idAt(ids, j) === part;
        }
      if (inside) out.push(y * w + x);
    }
  return out;
};

/** One part's flatness: how many interior px, the share within ΔE 3 of one of its paints, its shade blobs and the shade edge's raggedness. */
export interface Flatness {
  readonly part: number;
  readonly px: number;
  readonly share: number;
  readonly blobs: number;
  readonly raggedness: number;
}

/** A shade blob smaller than this many pixels is downsample speckle, not a painted shape. */
export const MIN_BLOB = 4;

/**
 * The shade blobs among `inner`: each pixel is lit (kind 1) or shade (kind
 * 2) by whichever of `labs`' first two (base, shade) it lies nearer, and the
 * blobs are the 4-connected shade pixels of `MIN_BLOB` px or more.
 */
const shadeBlobsOf = (
  plane: Float32Array,
  w: number,
  h: number,
  inner: ReadonlyArray<number>,
  labs: ReadonlyArray<Rgb>,
) => {
  const base = labs[0] ?? [0, 0, 0];
  const shade = labs[1] ?? base;
  const kind = new Uint8Array(w * h);
  for (const i of inner) {
    const c = labAt(plane, i);
    kind[i] = 1 + Number(deltaLab(c, shade) < deltaLab(c, base));
  }
  const blobs = components(w, h, (i) => kind[i] === 2).filter((c) => c.length >= MIN_BLOB);
  return { kind, blobs };
};

/** How far (px, either axis) a kept pixel may lie from a part's pixels in the render's ids pass and still be read as that part: past a 10 px misplacement, short of the next part over. */
export const PART_REACH = 16;

/** Where a kept pixel may be read as `part`: the part's pixels in the ids pass grown by `PART_REACH`. */
const partReach = (ids: Raster, part: number): Uint8Array =>
  dilate(
    new Uint8Array(ids.width * ids.height).map((_, i) => Number(idAt(ids, i) === part)),
    ids.width,
    ids.height,
    PART_REACH,
  );

/** `mask` grown by `r` px along both axes (a square of side 2r + 1 round each pixel). */
export const dilate = (mask: Uint8Array, w: number, h: number, r: number): Uint8Array => {
  const line = (src: Uint8Array, out: Uint8Array, start: number, stride: number, n: number) => {
    const next = new Float64Array(n);
    let seen = Infinity;
    for (let k = n - 1; k >= 0; k--) {
      if (src[start + k * stride] === 1) seen = k;
      next[k] = seen;
    }
    let last = -Infinity;
    for (let k = 0; k < n; k++) {
      if (src[start + k * stride] === 1) last = k;
      if (k - last <= r || (next[k] ?? Infinity) - k <= r) out[start + k * stride] = 1;
    }
  };
  const across = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) line(mask, across, y * w, 1, w);
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) line(across, out, x, w, h);
  return out;
};

/**
 * Each part's flatness in a colour frame against its ids pass: the share of
 * interior pixels within ΔE 3 of one of the part's paints; the shade blobs
 * (4-connected interior pixels nearer the shade than the base, `MIN_BLOB`
 * px or more); and the shade edge's raggedness, the shade pixels touching
 * the part's lit pixels over the square root of the shade's area (a straight
 * edge across a disc of radius r gives about 2r / √(πr²/2) ≈ 1.6).
 */
export const flatness = (
  colour: Raster,
  ids: Raster,
  paints: PartPaints,
): ReadonlyArray<Flatness> => {
  const plane = labPlane(colour);
  const { width: w, height: h } = colour;
  return [...paints.entries()].flatMap(([part, rgbs]) => {
    const inner = interiorOf(colour, ids, part);
    if (inner.length === 0) return [];
    const labs = rgbs.map(lab);
    const flat = inner.filter((i) => labs.some((p) => deltaLab(labAt(plane, i), p) <= 3)).length;
    const { kind, blobs } = shadeBlobsOf(plane, w, h, inner, labs);
    const shadeArea = blobs.reduce((s, c) => s + c.length, 0);
    const edge = blobs.flat().filter((i) => around(i, w, h).some((j) => kind[j] === 1)).length;
    return [
      {
        part,
        px: inner.length,
        share: flat / inner.length,
        blobs: blobs.length,
        raggedness: edge / Math.sqrt(Math.max(1, shadeArea)),
      },
    ];
  });
};

/** One part's colour against the kept view: the flat render pixels read and the worst ΔE between the two pictures' median colours of one paint. */
export interface PartDelta {
  readonly part: number;
  readonly px: number;
  readonly deltaE: number;
}

/** A paint is read only when this many flat pixels hold it in each picture. */
export const MIN_FLAT_PX = 40;

/** A kept pixel farther than this ΔE from every paint belongs to no paint. */
export const PAINT_RADIUS = 12;

/** Whether pixel `i`'s 5 × 5 neighbourhood lies within ΔE 6 of it, it is not ink, and it lies 2 px clear of the edge. */
const flatAt = (plane: Float32Array, w: number, h: number, i: number): boolean => {
  const c = labAt(plane, i);
  if (c[0] < INK_LIGHTNESS) return false;
  const x = i % w;
  const y = Math.floor(i / w);
  if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) return false;
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++)
      if (deltaLab(c, labAt(plane, (y + dy) * w + x + dx)) > 6) return false;
  return true;
};

/** The index in `labs` nearest `c`. */
const nearestOf = (labs: ReadonlyArray<Rgb>, c: Rgb): number =>
  labs.reduce((best, p, k) => {
    if (deltaLab(c, p) < deltaLab(c, labs[best] ?? p)) return k;
    return best;
  }, 0);

/** The per-channel median of the Lab triples at `pixels`; none when there are fewer than `MIN_FLAT_PX`. */
const medianLab = (plane: Float32Array, pixels: ReadonlyArray<number>): Option.Option<Rgb> => {
  if (pixels.length < MIN_FLAT_PX) return Option.none();
  const at = (k: 0 | 1 | 2) =>
    Option.getOrElse(median(pixels.map((i) => plane[i * 3 + k] ?? 0)), () => 0);
  return Option.some([at(0), at(1), at(2)]);
};

/**
 * Each part's colour against the kept view, read by paint and not by place,
 * so a part drawn a few pixels off its kept place reads no colour error. The
 * kept view has no ids pass: its flat figure pixels are each given the
 * nearest of every part's paints (within `PAINT_RADIUS`), and a part reads
 * only those within `PART_REACH` of its own pixels in the render's ids
 * pass, so another part's near colour far away is not its. The render's flat
 * pixels of a part (by the ids pass) are each given the nearer of that
 * part's own paints. For each paint, the ΔE76 between the two pictures'
 * per-channel median Lab; a part's value is its worst paint. A paint with
 * fewer than `MIN_FLAT_PX` pixels in either picture is not read, and a part
 * with no paint read is left out.
 */
export const partDeltas = (
  kept: Raster,
  scene: Raster,
  ids: Raster,
  paints: PartPaints,
): ReadonlyArray<PartDelta> => {
  const { width: w, height: h } = kept;
  const kl = labPlane(kept);
  const sl = labPlane(scene);
  const { palette, paletteLabs } = paletteOf(paints);
  const keptByPaint = palette.map((): Array<number> => []);
  const figure = figureMask(kept);
  for (let i = 0; i < w * h; i++) {
    if (figure[i] !== 1 || !flatAt(kl, w, h, i)) continue;
    const c = labAt(kl, i);
    const k = nearestOf(paletteLabs, c);
    if (deltaLab(c, paletteLabs[k] ?? c) <= PAINT_RADIUS) keptByPaint[k]?.push(i);
  }
  const sceneByPart = new Map<number, Array<number>>([...paints.keys()].map((p) => [p, []]));
  for (let i = 0; i < w * h; i++) {
    const list = sceneByPart.get(idAt(ids, i));
    if (list && flatAt(sl, w, h, i)) list.push(i);
  }
  return [...paints.entries()].flatMap(([part, rgbs]) => {
    const labs = rgbs.map(lab);
    const pixels = sceneByPart.get(part) ?? [];
    const byPaint = labs.map((): Array<number> => []);
    for (const i of pixels) byPaint[nearestOf(labs, labAt(sl, i))]?.push(i);
    const reach = partReach(ids, part);
    const deltas = rgbs.flatMap((c, k) => {
      const keptPixels = (keptByPaint[palette.indexOf(c.join(','))] ?? []).filter(
        (i) => reach[i] === 1,
      );
      return Option.match(
        Option.all([medianLab(kl, keptPixels), medianLab(sl, byPaint[k] ?? [])]),
        {
          onNone: () => [],
          onSome: ([a, b]) => [deltaLab(a, b)],
        },
      );
    });
    if (deltas.length === 0) return [];
    return [{ part, px: pixels.length, deltaE: Math.max(...deltas) }];
  });
};

/** Every distinct paint of every part, by its `r,g,b` key and in Lab. */
const paletteOf = (paints: PartPaints) => {
  const distinct = new Map([...paints.values()].flat().map((c) => [c.join(','), c]));
  return { palette: [...distinct.keys()], paletteLabs: [...distinct.values()].map(lab) };
};

/**
 * A part's shade blobs in the kept view, by the blob measure `flatness`
 * uses: the kept's part is its figure pixels, not ink, within `PART_REACH`
 * of the part in the render's ids pass, whose nearest paint of every part's
 * (within `PAINT_RADIUS`) is one of this part's; its interior is the pixels
 * whose 3 × 3 neighbourhood is all the part; each interior pixel is lit or
 * shade by the nearer of the part's base and shade.
 */
export const keptBlobs = (kept: Raster, ids: Raster, paints: PartPaints, part: number): number => {
  const { width: w, height: h } = kept;
  const plane = labPlane(kept);
  const figure = figureMask(kept);
  const ink = inkMask(kept);
  const reach = partReach(ids, part);
  const { palette, paletteLabs } = paletteOf(paints);
  const rgbs = paints.get(part) ?? [];
  const own = new Set(rgbs.map((c) => palette.indexOf(c.join(','))));
  const region = new Uint8Array(w * h).map((_, i) => {
    if (figure[i] !== 1 || ink[i] === 1 || reach[i] !== 1) return 0;
    const c = labAt(plane, i);
    const k = nearestOf(paletteLabs, c);
    return Number(own.has(k) && deltaLab(c, paletteLabs[k] ?? c) <= PAINT_RADIUS);
  });
  const inner: Array<number> = [];
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      let inside = true;
      for (let dy = -1; dy <= 1 && inside; dy++)
        for (let dx = -1; dx <= 1; dx++) inside = inside && region[(y + dy) * w + x + dx] === 1;
      if (inside) inner.push(y * w + x);
    }
  return shadeBlobsOf(plane, w, h, inner, rgbs.map(lab)).blobs.length;
};

/** The face's five marks' centres: left and right brow, left and right eye (by x), and the mouth. */
export interface FaceMarks {
  readonly brows: readonly [Point, Point];
  readonly eyes: readonly [Point, Point];
  readonly mouth: Point;
}

/**
 * The face's marks in a front view: the ink components of 6 to 4000 px that
 * touch neither the picture's edge nor the outline's component (the largest),
 * whose centres lie within `head` and within its middle 70 % across. Exactly
 * five, read top down as two brows, two eyes and the mouth; none otherwise.
 */
export const faceMarks = (r: Raster, head: Box): Option.Option<FaceMarks> => {
  const ink = inkMask(r);
  const { width: w, height: h } = r;
  const all = components(w, h, (i) => ink[i] === 1);
  const largest = all.reduce((m, c) => Math.max(m, c.length), 0);
  const mid = (head.x0 + head.x1) / 2;
  const half = ((head.x1 - head.x0) / 2) * 0.7;
  const centres = all
    .filter((c) => c.length >= 6 && c.length <= 4000 && c.length < largest)
    .map((c): Point => [
      c.reduce((s, i) => s + (i % w), 0) / c.length + 0.5,
      c.reduce((s, i) => s + Math.floor(i / w), 0) / c.length + 0.5,
    ])
    .filter(([x, y]) => y >= head.y0 && y <= head.y1 && Math.abs(x - mid) <= half)
    .sort((a, b) => a[1] - b[1]);
  if (centres.length !== 5) return Option.none();
  const pair = (p: Point, q: Point): readonly [Point, Point] => {
    if (p[0] <= q[0]) return [p, q];
    return [q, p];
  };
  const at = (k: number) => Option.fromUndefinedOr(centres[k]);
  return Option.all([at(0), at(1), at(2), at(3), at(4)]).pipe(
    Option.map(([a, b, c, d, mouth]) => ({ brows: pair(a, b), eyes: pair(c, d), mouth })),
  );
};

/** The largest distance between matching marks of two faces, in pixels. */
export const faceOffset = (p: FaceMarks, q: FaceMarks): number => {
  const d = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
  return Math.max(
    d(p.brows[0], q.brows[0]),
    d(p.brows[1], q.brows[1]),
    d(p.eyes[0], q.eyes[0]),
    d(p.eyes[1], q.eyes[1]),
    d(p.mouth, q.mouth),
  );
};

/** The worst relative change of a series from its first value, as a fraction; 0 for an empty series. */
export const worstDrift = (xs: ReadonlyArray<number>): number => {
  const first = xs[0] ?? 0;
  if (first === 0) return 0;
  return xs.reduce((m, x) => Math.max(m, Math.abs(x - first) / first), 0);
};
