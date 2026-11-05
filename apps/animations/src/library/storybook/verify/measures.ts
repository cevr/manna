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
import { drawnKeyOf, type Frame } from '../shot.ts';
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

/** One paint's median colour in a picture, and how many pixels it was read over. */
export interface PaintMedian {
  readonly rgb: Rgb;
  readonly count: number;
}

/** What one figure-alone render reads: whether the figure lies whole inside the frame, its lines, and its interior pixels, all and lit. */
export interface FigureRead {
  readonly whole: boolean;
  readonly lines: Option.Option<Lines>;
  readonly interior: number;
  readonly litInterior: number;
}

const NOTHING: FigureRead = {
  whole: false,
  lines: Option.none(),
  interior: 0,
  litInterior: 0,
};

/**
 * Each paint's median colour over its whole population in a picture, by
 * the paint's index in `lit`: every opaque pixel whose nearest paint it is,
 * however far its colour strays and wherever it lies, the ink's left out. A
 * paint drawn in stripes one pixel wide or in two alternating colours steps
 * as its median does. The colour step reads it on each drawn cell lit by the
 * shot's light, where every colour is the one drawn and no resampling has
 * blended an edge.
 */
export const paintMedians = (
  r: Raster,
  lit: ReadonlyArray<Paint>,
): ReadonlyMap<number, PaintMedian> => {
  const near = nearestOf(lit);
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
 * lines, and its interior pixels, all and lit (the light's).
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
        interior: interior.length,
        litInterior: interior.filter((q) => near(rgbAt(r, q)).distance <= LIGHT_NEAR).length,
      };
    },
  });

/** The worst ΔE76 between two pictures' medians of the paints each covers with `STEP_PIXELS` or more, none when they share no such paint. */
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

/** One figure in one rendered frame: its name, cell, plane zoom, whether a turn squashes it, its render's reading, and its crown-to-soles height read off the columns its render shows (`seenHeight`; none where no column shows), which the height bar reads in every frame of a key some frame cuts. */
export interface FrameRead {
  readonly frame: number;
  readonly name: string;
  readonly cell: string;
  readonly zoom: number;
  readonly squashed: boolean;
  readonly read: FigureRead;
  readonly seen: Option.Option<number>;
}

/** A crown-to-soles height from a figure's lines. */
const heightOf = (l: Lines): number => l.bottom - l.crown + 1;

/**
 * Each change of drawn key per figure over the planned frames (a new cell,
 * or its blink's eyes coming or going): the ΔE step between the two keys'
 * paint medians, each read on the drawn cell lit (`medians`, by figure
 * name, then drawn key). Unread where a key has no medians, or the two
 * share no paint of `STEP_PIXELS`.
 */
export const stepSamples = (
  planned: ReadonlyArray<PlannedFrame>,
  medians: ReadonlyMap<string, ReadonlyMap<string, ReadonlyMap<number, PaintMedian>>>,
): Samples => {
  const drawn = planned.flatMap(({ index, frame }) =>
    frame.figures.map((f) => ({ index, name: f.name, key: drawnKeyOf(f) })),
  );
  return [...Map.groupBy(drawn, (d) => d.name)].flatMap(([name, frames]) =>
    frames.flatMap((f, i): ReadonlyArray<Sample> => {
      const prev = frames[i - 1];
      if (!prev || prev.key === f.key) return [];
      const at = `${name} ${prev.key} -> ${f.key} frame ${f.index}`;
      const of = (key: string) => Option.fromUndefinedOr(medians.get(name)?.get(key));
      return [
        Option.match(Option.all([of(prev.key), of(f.key)]), {
          onNone: () => unreadAt(`${at}: a key with no lit cell read`),
          onSome: ([a, b]) =>
            Option.match(colourStep(a, b), {
              onNone: () => unreadAt(`${at}: no paint of ${STEP_PIXELS} px in both`),
              onSome: (v) => one(at, v),
            }),
        }),
      ];
    }),
  );
};

/** A figure the scale bar reads: its name, its layer's depth, and each stored cell's lines read once at its sheet's own size, none where the cell's anatomy reads none. */
export interface ScaledFigure {
  readonly name: string;
  readonly z: number;
  /** Its member's head share: its head as a share of a grown adult's. */
  readonly share: number;
  readonly lines: ReadonlyMap<string, Option.Option<Lines>>;
}

/** What the scale bar read: a sample per guest per planned frame, and the place of each sample that read a cell from its crown-to-soles. */
export interface ScaleRead {
  readonly samples: Samples;
  readonly fallbacks: ReadonlyArray<string>;
}

/** How a sample names a cell whose head column reads none, read from its crown-to-soles. */
const FROM_HEIGHT = 'head unread, from crown-to-soles';

/** A cell's head at its sheet's size, and whether it was read from the cell's crown-to-soles. */
interface CellHead {
  readonly head: number;
  readonly fromHeight: boolean;
}

/**
 * A figure's cell heads: the cell's own head where its head column reads
 * one; else, where its crown and soles read, its sheet's head × its
 * crown-to-soles over its sheet's median crown-to-soles, both medians over
 * the cells that read a head. None where its lines read none, or its sheet
 * reads no head.
 */
const cellHeadsOf = (f: ScaledFigure) => {
  const read = [...f.lines.values()].flatMap((l) =>
    Option.toArray(Option.filter(l, (x) => Option.isSome(x.head))),
  );
  const sheet = Option.all([
    medianOf(read.flatMap((l) => Option.toArray(l.head))),
    medianOf(read.map(heightOf)),
  ]);
  return (cell: string): Option.Option<CellHead> =>
    Option.flatMap(Option.flatten(Option.fromUndefinedOr(f.lines.get(cell))), (l) =>
      Option.match(l.head, {
        onSome: (head): Option.Option<CellHead> => Option.some({ head, fromHeight: false }),
        onNone: () =>
          Option.map(sheet, ([head, height]): CellHead => ({
            head: (head * heightOf(l)) / height,
            fromHeight: true,
          })),
      }),
    );
};

/** A cell's name in a sample, with the fallback named when its head was read from its crown-to-soles. */
const cellAt = (cell: string, read: Option.Option<CellHead>): string => {
  if (Option.exists(read, (r) => r.fromHeight)) return `${cell}: ${FROM_HEIGHT}`;
  return cell;
};

/** The INFO lines verdict.md carries for the scale bar: each frame read from crown-to-soles, one line each. */
export const scaleInfo = (read: ScaleRead): ReadonlyArray<string> =>
  read.fallbacks.map((at) => `scale fallback: ${at}`);

/** One planned frame: its index among the shot's frames, and the frame. */
export interface PlannedFrame {
  readonly index: number;
  readonly frame: Frame;
}

/**
 * Each figure's head against the shot's in every planned frame, as the plan
 * draws them: its cell's head at its sheet's size × its draw scale × its
 * plane's zoom (zoom^(1/z)) × its squash up, over the shot's grown head
 * `headPx` × its member's head share × 1/z × zoom^(1/z) (z its depth, zoom
 * the camera's). No render is read, so a frame that cuts a figure off or
 * resamples it reads the same. A cell whose head column reads none is read
 * from its crown-to-soles (`cellHeadsOf`), named so in its sample and in the
 * fallbacks. Unread where its cell's head was read neither way.
 */
export const scaleSamples = (
  planned: ReadonlyArray<PlannedFrame>,
  figures: ReadonlyArray<ScaledFigure>,
  headPx: number,
): ScaleRead => {
  const byName = new Map(
    figures.map((f) => [f.name, { z: f.z, share: f.share, headOf: cellHeadsOf(f) }] as const),
  );
  const read = planned.flatMap(({ index, frame }) => {
    const zoom = frame.camera.zoom;
    return frame.figures.map((f) => {
      const b = byName.get(f.name) ?? { z: 1, share: 1, headOf: () => Option.none<CellHead>() };
      const mine = b.headOf(f.cell);
      const fromHeight = Option.exists(mine, (m) => m.fromHeight);
      const at = `${f.name} frame ${index} (${f.cell})`;
      const sample = Option.match(mine, {
        onNone: () => unreadAt(`${at}: no head read, nor one from crown-to-soles, in its cell`),
        onSome: (m) =>
          one(
            `${f.name} frame ${index} (${cellAt(f.cell, mine)})`,
            (m.head * f.scale * zoom ** (1 / b.z) * f.sy) /
              ((headPx * b.share * zoom ** (1 / b.z)) / b.z),
          ),
      });
      return { sample, fromHeight };
    });
  });
  return {
    samples: read.map((r) => r.sample),
    fallbacks: read.filter((r) => r.fromHeight).map((r) => r.sample.at),
  };
};

/** One key's crown-to-soles heights over its plane zoom: (max − min) over the median, with how many frames it read. */
const keySpread = (heights: ReadonlyArray<number>) =>
  Option.map(medianOf(heights), (median) => ({
    frames: heights.length,
    spread: (Math.max(...heights) - Math.min(...heights)) / median,
  }));

/**
 * A figure's crown-to-soles height in one frame of a key, in the frame's px:
 * its render's lines where every frame of the key lies whole, else the
 * height read off the columns its render shows (`FrameRead.seen`) in every
 * frame of the key, whole ones too. The two reads of one drawing differ by a
 * px or two (the crown's soft edge against the median column top), so one
 * key is read one way throughout and only the drawing's own change spreads.
 */
const frameHeightOf =
  (cut: boolean) =>
  (f: FrameRead): Option.Option<number> => {
    if (!cut) return Option.map(f.read.lines, heightOf);
    return f.seen;
  };

/**
 * Each figure's crown-to-soles height over its plane zoom, over its
 * unsquashed frames, spread within each key it holds: (max − min) over the
 * median, its worst key. Two keys of one sheet differ in height by design (a
 * bowed head, a seat), which the scale and proportions bars hold across keys;
 * this reads only the figure growing or shrinking while one key holds. A
 * key some frame cuts is read, in every frame, off the columns its render
 * shows, down to the soles' row its placement pins (`seenHeight`), so a close
 * is judged on its own frames; a figure no frame reads is unread, never passed.
 */
export const heightSamples = (reads: ReadonlyArray<FrameRead>): Samples =>
  [...Map.groupBy(reads, (r) => r.name)].map(([name, frames]) =>
    keyHeightSample(
      name,
      frames.filter((f) => !f.squashed),
    ),
  );

/** One figure's worst key spread over its unsquashed frames, unread where a whole frame reads no lines or no frame reads a height. */
const keyHeightSample = (name: string, still: ReadonlyArray<FrameRead>): Sample => {
  const unread = still.find((f) => f.read.whole && Option.isNone(f.read.lines));
  if (unread) return unreadAt(`${name} frame ${unread.frame}: no lines read`);
  const keys = [...Map.groupBy(still, (f) => f.cell)].flatMap(([cell, held]) =>
    Option.toArray(
      Option.map(
        keySpread(
          held.flatMap((f) =>
            Option.toArray(
              Option.map(frameHeightOf(held.some((h) => !h.read.whole))(f), (h) => h / f.zoom),
            ),
          ),
        ),
        (s) => ({ cell, ...s }),
      ),
    ),
  );
  const worst = Option.fromUndefinedOr(keys.toSorted((a, b) => b.spread - a.spread)[0]);
  return Option.match(worst, {
    onNone: () => unreadAt(`${name}: no unsquashed frame reads its height`),
    onSome: (k) => one(`${name}/${k.cell} over ${k.frames} frames`, k.spread),
  });
};

/** The INFO lines verdict.md carries for the height bar: each figure some frame cuts, with how many of its unsquashed frames were read off the columns they show. */
export const heightInfo = (reads: ReadonlyArray<FrameRead>): ReadonlyArray<string> =>
  [...Map.groupBy(reads, (r) => r.name)].flatMap(([name, frames]) => {
    const cut = frames.filter((f) => !f.squashed && !f.read.whole && Option.isSome(f.seen)).length;
    return [`render-height cut: ${name} read in ${cut} frames off the columns they show`].filter(
      () => cut > 0,
    );
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

/** The lines the proportions bar reads: the soles row, the hem, the sash top and the head (crown to collar), each with the roles its palette must hold, and whether it is judged over the cells that read it (`overRead`) rather than failing on the first cell that misses it. */
const LINES: ReadonlyArray<{
  readonly name: string;
  readonly roles: ReadonlyArray<Role>;
  readonly read: (l: Lines) => Option.Option<number>;
  readonly overRead: boolean;
}> = [
  { name: 'soles', roles: [], read: (l) => Option.some(l.bottom), overRead: false },
  { name: 'hem', roles: ['garment'], read: (l) => l.hem, overRead: false },
  { name: 'sash top', roles: ['sash'], read: (l) => l.sashTop, overRead: false },
  { name: 'head', roles: ['skin', 'garment'], read: (l) => l.head, overRead: true },
];

/** What the proportions bar read of a sheet: a sample per line, and each cell (`<member> <cell>`) the head line left out because its head column reads none. */
export interface ProportionRead {
  readonly samples: Samples;
  readonly leftOut: ReadonlyArray<string>;
}

/**
 * A sheet's proportions: per line its palette has the roles for, (max − min)
 * over the sheet's cells as a share of their median crown-to-soles height.
 * Every cell must read its crown and soles, and its hem and sash top where
 * its palette has their roles; a line one cell misses is unread. The head
 * is judged over the cells that read one, as a head column can read none
 * where the jaw cuts the face from the neck: each cell left out is named in
 * the head's sample and in `leftOut`, and the head is unread when no cell
 * reads one. A line the palette has no role for is skipped.
 */
export const proportionSamples = (
  member: string,
  cells: ReadonlyArray<{ readonly key: string; readonly lines: Option.Option<Lines> }>,
  paints: ReadonlyArray<Paint>,
): ProportionRead => {
  const unlined = cells.find((c) => Option.isNone(c.lines));
  if (unlined)
    return { samples: [unreadAt(`${member} ${unlined.key}: no lines read`)], leftOut: [] };
  const lined = cells.flatMap((c) =>
    Option.toArray(Option.map(c.lines, (l) => ({ key: c.key, l }))),
  );
  const height = Option.getOrElse(medianOf(lined.map((c) => heightOf(c.l))), () => 1);
  const roles = new Set(paints.map((p) => p.role));
  const read = LINES.filter((line) => line.roles.every((r) => roles.has(r))).map((line) => {
    const values = lined.map((c) => ({ key: c.key, v: line.read(c.l) }));
    const known = values.flatMap((x) => Option.toArray(x.v));
    const missing = values.filter((x) => Option.isNone(x.v)).map((x) => x.key);
    const spread = (Math.max(...known) - Math.min(...known)) / height;
    if (known.length === 0)
      return { sample: unreadAt(`${member} ${line.name}: unread in every cell`), leftOut: [] };
    if (missing.length === 0) return { sample: one(`${member} ${line.name}`, spread), leftOut: [] };
    if (!line.overRead)
      return { sample: unreadAt(`${member} ${line.name}: unread in ${missing[0]}`), leftOut: [] };
    return {
      sample: one(`${member} ${line.name} (${missing.join(', ')}: ${LEFT_OUT})`, spread),
      leftOut: missing.map((key) => `${member} ${key}`),
    };
  });
  return { samples: read.map((r) => r.sample), leftOut: read.flatMap((r) => r.leftOut) };
};

/** How the head's sample names the cells it left out. */
const LEFT_OUT = 'head unread, left out';

/** The INFO lines verdict.md carries for the proportions bar: each cell the head line left out, one line each. */
export const proportionInfo = (read: ProportionRead): ReadonlyArray<string> =>
  read.leftOut.map((at) => `proportions left out: ${at} (head unread)`);
