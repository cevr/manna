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

/** How near (ΔE76) a rendered pixel must lie to a lit paint to count toward that paint's median. */
const MEDIAN_NEAR = 10;

/** How near (ΔE76) the light bar holds a pixel to its neighbours (interior) and to a lit paint. */
const LIGHT_NEAR = 1;

/** One paint's median colour in a render, and how many pixels it was read over. */
export interface PaintMedian {
  readonly rgb: Rgb;
  readonly count: number;
}

/** What one figure-alone render reads: whether the figure lies whole inside the frame, its lines, each paint's median, and its interior pixels, all and lit. */
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

/** Each paint's median colour over the interior pixels nearest it (within `MEDIAN_NEAR`), by the paint's index: an outline's blended fringe never counts. */
const mediansOf = (
  r: Raster,
  interior: ReadonlyArray<number>,
  near: (c: Rgb) => { readonly index: number; readonly distance: number },
): ReadonlyMap<number, PaintMedian> => {
  const channels = new Map<number, readonly [Array<number>, Array<number>, Array<number>]>();
  for (const q of interior) {
    const c = rgbAt(r, q);
    const { index, distance } = near(c);
    if (distance > MEDIAN_NEAR) continue;
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
 * lines in its head and centre columns, each paint's median and its interior.
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
        medians: mediansOf(r, interior, near),
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

/** One figure in one rendered frame: its name, cell, layer depth, plane zoom, whether a turn squashes it, and its render's reading. */
export interface FrameRead {
  readonly frame: number;
  readonly name: string;
  readonly cell: string;
  readonly z: number;
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

/** A figure's head in one frame brought to the focal plane: over its plane's zoom, times its layer's depth. */
const levelOf = (r: FrameRead): Option.Option<number> =>
  Option.map(
    Option.flatMap(r.read.lines, (l) => l.head),
    (h) => (h / r.zoom) * r.z,
  );

/**
 * Each figure's head in every frame it lies whole and unsquashed in,
 * brought to the focal plane (over its plane zoom, times its depth), over
 * the lead's head: the median of the lead's heads brought there the same
 * way, so one number stands for the lead's head and a figure is judged
 * against it in every frame.
 */
export const scaleSamples = (reads: ReadonlyArray<FrameRead>, lead: string): Samples => {
  const still = reads.filter((f) => f.read.whole && !f.squashed);
  const leadHead = medianOf(
    still.filter((f) => f.name === lead).flatMap((f) => Option.toArray(levelOf(f))),
  );
  if (Option.isNone(leadHead)) return [unreadAt(`${lead}: no head read in a whole frame`)];
  return still.map((f): Sample => {
    const at = `${f.name} frame ${f.frame}`;
    return Option.match(levelOf(f), {
      onNone: () => unreadAt(`${at}: no head read`),
      onSome: (mine) => one(at, mine / leadHead.value),
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

/** Each figure's share of interior pixels the one light lit from a palette paint, per frame it shows in. */
export const lightSamples = (reads: ReadonlyArray<FrameRead>): Samples =>
  reads
    .filter((r) => r.read.interior > 0)
    .map((r) => one(`${r.name} frame ${r.frame}`, r.read.litInterior / r.read.interior));

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
 * over the sheet's cells as a share of their median crown-to-soles height. A
 * line read in no cell is skipped (the drawing holds no such line); one read
 * in some cells and not others is unread.
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
      if (read.length === 0) return [];
      if (missing) return [unreadAt(`${member} ${line.name}: unread in ${missing.key}`)];
      return [one(`${member} ${line.name}`, (Math.max(...read) - Math.min(...read)) / height)];
    },
  );
};
