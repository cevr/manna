import { labOf } from '@manna/film/core';
import type { Raster } from '@manna/film/tools';
import { Option } from 'effect';
import {
  alphaAt,
  type Box,
  cropOf,
  type Lines,
  linesOf,
  medianOf,
  nearestOf,
  type Paint,
  POCKET_SUM,
  type Role,
  rgbAt,
  type Rgb,
  rgbSum,
} from '../sheet.ts';
import type { FigureFrame, Frame } from '../shot.ts';
import { one, type Sample, type Samples, unreadAt } from './verdict.ts';

/** A colour as one number, for sets and maps. */
const keyOf = (c: Rgb): number => (c[0] << 16) | (c[1] << 8) | c[2];

/** The share of a stored cell's opaque pixels that are exactly a paint of its palette (the ink one of them). */
export const paletteShare = (cell: Raster, paints: ReadonlyArray<Paint>): number => {
  const exact = new Set(paints.map((p) => keyOf(p.rgb)));
  let opaque = 0;
  let painted = 0;
  for (let q = 0; q < cell.width * cell.height; q++) {
    if (alphaAt(cell, q) !== 255) continue;
    opaque += 1;
    if (exact.has(keyOf(rgbAt(cell, q)))) painted += 1;
  }
  return painted / Math.max(1, opaque);
};

/** How many of a stored cell's opaque pixels lie within a channel sum of `POCKET_SUM` of its sheet's ground: a pocket the split left. */
export const pocketCount = (cell: Raster, ground: Rgb): number => {
  let n = 0;
  for (let q = 0; q < cell.width * cell.height; q++)
    if (alphaAt(cell, q) > 0 && rgbSum(rgbAt(cell, q), ground) <= POCKET_SUM) n += 1;
  return n;
};

/** The box round a picture's opaque pixels, none when it has none. */
export const opaqueBox = (r: Raster): Option.Option<Box> => {
  let [x0, y0, x1, y1] = [r.width, r.height, -1, -1];
  for (let y = 0; y < r.height; y++)
    for (let x = 0; x < r.width; x++)
      if (alphaAt(r, y * r.width + x) > 0) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
  return Option.some({ x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }).pipe(
    Option.filter(() => x1 >= 0),
  );
};

/** The fewest pixels a paint must cover in both frames of a step for its median to count. */
export const STEP_PIXELS = 150;

/** How near (ΔE76) the light bar holds a pixel to its neighbours (interior) and to a lit paint. */
const LIGHT_NEAR = 1;

/** One paint's median colour in a render, and how many pixels it was read over. */
export interface PaintMedian {
  readonly rgb: Rgb;
  readonly count: number;
}

/** What one figure-alone render reads: whether the figure lies whole inside the frame, its lines, each paint but the ink its median over every opaque pixel nearest it, and its interior pixels, all and lit. */
export interface FigureRead {
  readonly whole: boolean;
  readonly lines: Option.Option<Lines>;
  readonly medians: ReadonlyMap<number, PaintMedian>;
  readonly interior: number;
  readonly litInterior: number;
}

const NOTHING: FigureRead = {
  whole: false,
  lines: Option.none(),
  medians: new Map(),
  interior: 0,
  litInterior: 0,
};

/**
 * Each paint's median colour over its whole population, by the paint's
 * index: every opaque pixel whose nearest paint it is, however far its
 * colour strays and wherever it lies, the ink's left out. A paint drawn in
 * stripes one pixel wide or in two alternating colours steps as its median
 * does.
 */
const mediansOf = (
  r: Raster,
  lit: ReadonlyArray<Paint>,
  near: (c: Rgb) => { readonly index: number; readonly distance: number },
): ReadonlyMap<number, PaintMedian> => {
  const channels = new Map<number, readonly [Array<number>, Array<number>, Array<number>]>();
  for (let q = 0; q < r.width * r.height; q++) {
    if (alphaAt(r, q) !== 255) continue;
    const c = rgbAt(r, q);
    const index = near(c).index;
    if (lit[index]?.role === 'ink') continue;
    const ch = channels.get(index) ?? ([[], [], []] as const);
    ch[0].push(c[0]);
    ch[1].push(c[1]);
    ch[2].push(c[2]);
    channels.set(index, ch);
  }
  const median = (xs: ReadonlyArray<number>) => Option.getOrElse(medianOf(xs), () => 0);
  return new Map(
    [...channels].map(
      ([index, ch]) =>
        [
          index,
          { rgb: [median(ch[0]), median(ch[1]), median(ch[2])] as const, count: ch[0].length },
        ] as const,
    ),
  );
};

/** A colour's Lab, each colour worked out once. */
const labCache = () => {
  const known = new Map<number, Rgb>();
  return (c: Rgb): Rgb => {
    const key = keyOf(c);
    const hit = known.get(key);
    if (hit) return hit;
    const lab = labOf(c);
    known.set(key, lab);
    return lab;
  };
};

/** Whether pixel `q` (not on the edge) is interior: it and every 8-neighbour opaque, each within ΔE 1 of it. */
const interiorAt = (r: Raster, q: number, close: (a: Rgb, b: Rgb) => boolean): boolean => {
  if (alphaAt(r, q) !== 255) return false;
  const c = rgbAt(r, q);
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const m = q + dy * r.width + dx;
      if (alphaAt(r, m) !== 255 || !close(c, rgbAt(r, m))) return false;
    }
  return true;
};

/** The interior pixels of `r`, in scan order. */
const interiorOf = (r: Raster): ReadonlyArray<number> => {
  const lab = labCache();
  const close = (a: Rgb, b: Rgb) => {
    if (keyOf(a) === keyOf(b)) return true;
    const p = lab(a);
    const q = lab(b);
    return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) <= LIGHT_NEAR;
  };
  const interior: Array<number> = [];
  for (let y = 1; y < r.height - 1; y++)
    for (let x = 1; x < r.width - 1; x++)
      if (interiorAt(r, y * r.width + x, close)) interior.push(y * r.width + x);
  return interior;
};

/**
 * One figure-alone render read against its member's lit paints: cropped to
 * the figure, whether it lies whole in the frame (clear of every edge), its
 * lines, each paint but the ink its median over every opaque pixel nearest
 * it (the colour step's) and its interior pixels, all and lit (the light's).
 */
export const readFigure = (render: Raster, lit: ReadonlyArray<Paint>): FigureRead =>
  Option.match(opaqueBox(render), {
    onNone: () => NOTHING,
    onSome: (box) => {
      const r = cropOf(render, box);
      const near = nearestOf(lit);
      const interior = interiorOf(r);
      return {
        whole:
          box.x > 0 &&
          box.y > 0 &&
          box.x + box.width < render.width &&
          box.y + box.height < render.height,
        lines: linesOf(r, lit),
        medians: mediansOf(r, lit, near),
        interior: interior.length,
        litInterior: interior.filter((q) => near(rgbAt(r, q)).distance <= LIGHT_NEAR).length,
      };
    },
  });

/** The worst ΔE76 between two renders' medians of the paints each covers with `STEP_PIXELS` or more, none when they share no such paint. */
export const colourStep = (
  a: ReadonlyMap<number, PaintMedian>,
  b: ReadonlyMap<number, PaintMedian>,
): Option.Option<number> => {
  const steps = [...a].flatMap(([index, m]) => {
    const n = b.get(index);
    if (!n || m.count < STEP_PIXELS || n.count < STEP_PIXELS) return [];
    const p = labOf(m.rgb);
    const q = labOf(n.rgb);
    return [Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])];
  });
  return Option.some(Math.max(...steps)).pipe(Option.filter(() => steps.length > 0));
};

/** One figure in one rendered frame: its name, cell, plane zoom, whether a turn squashes it, and its render's reading. */
export interface FrameRead {
  readonly frame: number;
  readonly name: string;
  readonly cell: string;
  readonly zoom: number;
  readonly squashed: boolean;
  readonly read: FigureRead;
}

/** A crown-to-soles height from a figure's lines. */
const heightOf = (l: Lines): number => l.bottom - l.crown + 1;

/** Each change of drawn cell, per figure: the ΔE step between the frames either side of it. */
export const stepSamples = (reads: ReadonlyArray<FrameRead>): Samples => {
  const byName = Map.groupBy(reads, (r) => r.name);
  return [...byName].flatMap(([name, frames]) =>
    frames.flatMap((f, i): ReadonlyArray<Sample> => {
      const prev = frames[i - 1];
      if (!prev || prev.cell === f.cell) return [];
      const at = `${name} ${prev.cell} -> ${f.cell} frame ${f.frame}`;
      return [
        Option.match(colourStep(prev.read.medians, f.read.medians), {
          onNone: () => unreadAt(`${at}: no paint of ${STEP_PIXELS} px in both`),
          onSome: (v) => one(at, v),
        }),
      ];
    }),
  );
};

/** A figure the scale bar reads: its name, its layer's depth, and each stored cell's head (crown to collar) read once at its sheet's own size, none where the cell's anatomy reads none. */
export interface ScaledFigure {
  readonly name: string;
  readonly z: number;
  readonly heads: ReadonlyMap<string, Option.Option<number>>;
}

/** One planned frame: its index among the shot's frames, and the frame. */
export interface PlannedFrame {
  readonly index: number;
  readonly frame: Frame;
}

/**
 * Each figure's head against the lead's in every planned frame, as the plan
 * draws them: its cell's head at its sheet's size × its draw scale × its
 * plane's zoom (zoom^(1/z)) × its squash up, over the lead's drawn so × 1/z
 * × zoom^(1/z) ÷ zoom (z its depth, zoom the camera's). No render is read,
 * so a frame that cuts a figure off or resamples it reads the same. Unread
 * where its cell's head or the lead's was not read.
 */
export const scaleSamples = (
  planned: ReadonlyArray<PlannedFrame>,
  figures: ReadonlyArray<ScaledFigure>,
  lead: string,
): Samples => {
  const byName = new Map(figures.map((f) => [f.name, f] as const));
  return planned.flatMap(({ index, frame }): Samples => {
    const zoom = frame.camera.zoom;
    const drawn = (f: FigureFrame): Option.Option<number> => {
      const z = byName.get(f.name)?.z ?? 1;
      const head = Option.flatten(Option.fromUndefinedOr(byName.get(f.name)?.heads.get(f.cell)));
      return Option.map(head, (h) => h * f.scale * zoom ** (1 / z) * f.sy);
    };
    const ref = frame.figures.find((f) => f.name === lead);
    if (!ref) return [];
    return frame.figures
      .filter((f) => f.name !== lead)
      .map((f): Sample => {
        const z = byName.get(f.name)?.z ?? 1;
        const at = `${f.name} frame ${index} (${f.cell}; ${lead} ${ref.cell})`;
        return Option.match(Option.all([drawn(f), drawn(ref)]), {
          onNone: () => unreadAt(`${at}: no head read in its cell or the lead's`),
          onSome: ([mine, theirs]) => one(at, mine / (theirs * (1 / z) * (zoom ** (1 / z) / zoom))),
        });
      });
  });
};

/** Each figure's crown-to-soles height over its plane zoom, over its whole unsquashed frames: (max − min) over the median. */
export const heightSamples = (reads: ReadonlyArray<FrameRead>): Samples =>
  [...Map.groupBy(reads, (r) => r.name)].map(([name, frames]): Sample => {
    const still = frames.filter((f) => f.read.whole && !f.squashed);
    const unread = still.find((f) => Option.isNone(f.read.lines));
    if (unread) return unreadAt(`${name} frame ${unread.frame}: no lines read`);
    const heights = still.flatMap((f) =>
      Option.toArray(Option.map(f.read.lines, (l) => heightOf(l) / f.zoom)),
    );
    return Option.match(medianOf(heights), {
      onNone: () => unreadAt(`${name}: no whole unsquashed frame`),
      onSome: (median) =>
        one(
          `${name} over ${heights.length} frames`,
          (Math.max(...heights) - Math.min(...heights)) / median,
        ),
    });
  });

/**
 * Each figure's share of interior pixels the one light lit from a palette
 * paint, per frame it shows in with an interior. A frame it lies whole in
 * with no interior pixel is unread, as is a figure with no frame to read;
 * a frame that cuts it to a sliver with no interior is skipped.
 */
export const lightSamples = (reads: ReadonlyArray<FrameRead>): Samples =>
  [...Map.groupBy(reads, (r) => r.name)].flatMap(([name, frames]): Samples => {
    const samples = frames.flatMap((r): Samples => {
      const at = `${name} frame ${r.frame}`;
      if (r.read.interior > 0) return [one(at, r.read.litInterior / r.read.interior)];
      if (r.read.whole) return [unreadAt(`${at}: no interior pixel`)];
      return [];
    });
    if (samples.length === 0) return [unreadAt(`${name}: no frame with an interior pixel`)];
    return samples;
  });

/** The lines the proportions bar reads: the soles row, the hem, the sash top and the head (crown to collar), each with the roles its palette must hold. */
const LINES: ReadonlyArray<{
  readonly name: string;
  readonly roles: ReadonlyArray<Role>;
  readonly read: (l: Lines) => Option.Option<number>;
}> = [
  { name: 'soles', roles: [], read: (l) => Option.some(l.bottom) },
  { name: 'hem', roles: ['garment'], read: (l) => l.hem },
  { name: 'sash top', roles: ['sash'], read: (l) => l.sashTop },
  { name: 'head', roles: ['skin', 'garment'], read: (l) => l.head },
];

/**
 * A sheet's proportions: per line its palette has the roles for, (max − min)
 * over the sheet's cells as a share of their median crown-to-soles height.
 * A line its palette has the roles for is unread when any cell does not
 * read it, and when none does; a line it has no role for is skipped.
 */
export const proportionSamples = (
  member: string,
  cells: ReadonlyArray<{ readonly key: string; readonly lines: Option.Option<Lines> }>,
  paints: ReadonlyArray<Paint>,
): Samples => {
  const unlined = cells.find((c) => Option.isNone(c.lines));
  if (unlined) return [unreadAt(`${member} ${unlined.key}: no lines read`)];
  const lined = cells.flatMap((c) =>
    Option.toArray(Option.map(c.lines, (l) => ({ key: c.key, l }))),
  );
  const height = Option.getOrElse(medianOf(lined.map((c) => heightOf(c.l))), () => 1);
  const roles = new Set(paints.map((p) => p.role));
  return LINES.filter((line) => line.roles.every((r) => roles.has(r))).flatMap(
    (line): ReadonlyArray<Sample> => {
      const values = lined.map((c) => ({ key: c.key, v: line.read(c.l) }));
      const read = values.flatMap((x) => Option.toArray(x.v));
      const missing = values.find((x) => Option.isNone(x.v));
      if (read.length === 0) return [unreadAt(`${member} ${line.name}: unread in every cell`)];
      if (missing) return [unreadAt(`${member} ${line.name}: unread in ${missing.key}`)];
      return [one(`${member} ${line.name}`, (Math.max(...read) - Math.min(...read)) / height)];
    },
  );
};
