import { labOf } from '@manna/film/core';
import type { Raster } from '@manna/film/tools';
import { Option, Result } from 'effect';
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

/** A figure's complete crown-to-soles in one frame, in frame px, observed on its uncropped figure-alone render (`observeHeight`), or why it could not be observed. */
export type HeightRead = Result.Result<number, string>;

/** One figure in one rendered frame: its name, cell, plane zoom, whether a turn squashes it, its cropped figure-alone render's reading (the light bar's), and its complete height (`HeightRead`, the height bar's). */
export interface FrameRead {
  readonly frame: number;
  readonly name: string;
  readonly cell: string;
  readonly zoom: number;
  readonly squashed: boolean;
  readonly read: FigureRead;
  readonly height: HeightRead;
}

/** A crown-to-soles height from a figure's lines. */
const heightOf = (l: Lines): number => l.bottom - l.crown + 1;

/** The least alpha that finds a crown's or a sole's edge: half covered, where a drawn edge lies once the page resamples it, so a faint fringe alone is never the edge. */
export const EDGE_ALPHA = 128;

/** The least alpha a pixel holds to count as wholly inside the figure, where an edge's ramp of partial coverage ends. */
export const FULL_ALPHA = 250;

/**
 * Where an edge lies along a profile of coverage (`at(i)`, 0–255, for
 * `i` in `0 … n − 1`) that rises from nothing into the figure: the
 * boundary, in px from index 0's outer side, at which the profile's whole
 * ramp of partial coverage would be one full step. The ramp runs from the
 * first half-covered index back over its contiguous fringe to the first
 * index past it wholly covered (`FULL_ALPHA`), and its summed coverage is
 * the px the figure fills of it: a resampling filter spreads an edge's
 * coverage over its ramp without changing that sum, whatever the sampling
 * phase, so the edge reads to a fraction of a px. None when no index is
 * half covered, or none past it wholly covered.
 */
const edgeAlong = (at: (i: number) => number, n: number): Option.Option<number> => {
  let half = 0;
  while (half < n && at(half) < EDGE_ALPHA) half += 1;
  if (half >= n) return Option.none();
  let full = half;
  while (full < n && at(full) < FULL_ALPHA) full += 1;
  if (full >= n) return Option.none();
  let start = half;
  while (start > 0 && at(start - 1) > 0) start -= 1;
  let filled = 0;
  for (let i = start; i < full; i++) filled += at(i) / 255;
  return Option.some(full - filled);
};

/**
 * The least crown-to-soles, in frame px, the height bar reads: over the
 * cast's cells in Chrome, at every sampling phase, a steady figure from
 * this height up reads within 0.7 px (a spread under 0.006) and one 3 %
 * taller or shorter over 0.024, clear of the 0.02 bar either way; below it
 * a 3 % change comes too near the bar to tell, so the frame reads unread.
 * Act 1 draws no figure under 234 px.
 */
export const LEAST_HEIGHT = 100;

/** The share of a figure's height, from its top, whose pixels place its head column (`linesOf`'s). */
const HEAD_BAND = 0.1;

/** The crown in column `x` of `r`, in px from `r`'s top, to a fraction of a px (`edgeAlong`). */
const crownEdgeOf = (r: Raster, x: number): Option.Option<number> =>
  edgeAlong((y) => alphaAt(r, y * r.width + x), r.height);

/** Each row's most covered pixel: the profile `r`'s top and soles are read along. */
const mostCovered = (r: Raster): Uint8Array => {
  const most = new Uint8Array(r.height);
  for (let y = 0; y < r.height; y++)
    for (let x = 0; x < r.width; x++) most[y] = Math.max(most[y] ?? 0, alphaAt(r, y * r.width + x));
  return most;
};

/**
 * The head column of `r` to a fraction of a px, in px from its left side:
 * `linesOf`'s, the mean column of the figure's top `HEAD_BAND` of its
 * height, here weighed by each pixel's coverage over a band from its top
 * edge (`top`) cut to a fraction of a row, so the column moves with the
 * drawing and never by a sampling phase. None when the band covers nothing.
 */
const headColumnOf = (r: Raster, top: number, height: number): Option.Option<number> => {
  const end = top + HEAD_BAND * height;
  let sum = 0;
  let weight = 0;
  for (let y = Math.max(0, Math.floor(top)); y < Math.min(r.height, Math.ceil(end)); y++) {
    const share = Math.min(y + 1, end) - Math.max(y, top);
    for (let x = 0; x < r.width; x++) {
      const w = share * alphaAt(r, y * r.width + x);
      sum += w * (x + 0.5);
      weight += w;
    }
  }
  return Option.some(sum / weight).pipe(Option.filter(() => weight > 0));
};

/** The crown at the head column `column`, between the crowns of the two columns whose middles lie either side of it, weighed by how near each lies. */
const crownAtColumn = (r: Raster, column: number): Option.Option<number> => {
  const left = Math.min(Math.max(Math.floor(column - 0.5), 0), r.width - 2);
  const t = Math.min(Math.max(column - 0.5 - left, 0), 1);
  return Option.map(
    Option.all([crownEdgeOf(r, left), crownEdgeOf(r, left + 1)]),
    ([a, b]) => a + (b - a) * t,
  );
};

/** A figure's top, crown and soles on `r`, its crop, each to a fraction of a px from its top; none where one reads none. */
const endpointsOf = (r: Raster) => {
  const most = mostCovered(r);
  return Option.flatMap(
    Option.all([
      edgeAlong((i) => most[i] ?? 0, r.height),
      Option.map(
        edgeAlong((i) => most[r.height - 1 - i] ?? 0, r.height),
        (fromBottom) => r.height - fromBottom,
      ),
    ]),
    ([top, soles]) =>
      Option.map(
        Option.flatMap(headColumnOf(r, top, soles - top), (column) => crownAtColumn(r, column)),
        (crown) => ({ crown, soles }),
      ),
  );
};

/**
 * A figure's complete crown-to-soles observed on its analysis render: the
 * figure alone at its frame's own transform, painted on a surface round its
 * whole placed cell (`analysisBoxOf`), so no edge of the frame cuts it. Read
 * by the sheet's line semantics (`linesOf`): the crown in its head column
 * (the mean column of its top tenth), so a raised arm or a separated foot is
 * never the crown, and the soles its lowest edge. Each is read to a
 * fraction of a px from the coverage the raster holds: the head column
 * weighed by coverage, the crown between the two columns about it, and each
 * edge from its ramp's summed coverage (`edgeAlong`); so neither a sampling
 * phase nor a hair's faint fringe moves an endpoint by a whole px, and a
 * crown on a slope stays at the same drawn point. Unread where the render
 * holds none of it, where it touches the surface's edge (the surface cut it
 * after all), or where an endpoint reads none: a plan never stands in for a
 * pixel.
 */
export const observeHeight = (complete: Raster): HeightRead =>
  Option.match(opaqueBox(complete), {
    onNone: () => Result.fail('its analysis render holds none of it'),
    onSome: (box) => {
      if (
        box.x === 0 ||
        box.y === 0 ||
        box.x + box.width === complete.width ||
        box.y + box.height === complete.height
      )
        return Result.fail('its analysis render reaches the surface edge');
      return Option.match(endpointsOf(cropOf(complete, box)), {
        onNone: () =>
          Result.fail('no crown or soles both half and wholly covered on its analysis render'),
        onSome: ({ crown, soles }) => {
          if (soles - crown < LEAST_HEIGHT)
            return Result.fail(
              `drawn ${(soles - crown).toFixed(1)} px tall, under the ${LEAST_HEIGHT} px the bar reads to`,
            );
          return Result.succeed(soles - crown);
        },
      });
    },
  });

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
 * Each figure's complete crown-to-soles over its plane zoom, over its
 * unsquashed frames, spread within each key it holds: (max − min) over the
 * median, its worst key. Two keys of one sheet differ in height by design (a
 * bowed head, a seat), which the scale and proportions bars hold across keys;
 * this reads only the figure growing or shrinking while one key holds. Every
 * frame is read the one way, off its uncropped analysis render
 * (`FrameRead.height`), whether the frame shows it whole or cut, so the view
 * moving never changes how a frame is read. A figure with any unsquashed
 * frame unread, or with none, is unread: an unread frame is never dropped.
 */
export const heightSamples = (reads: ReadonlyArray<FrameRead>): Samples =>
  [...Map.groupBy(reads, (r) => r.name)].map(([name, frames]) =>
    keyHeightSample(
      name,
      frames.filter((f) => !f.squashed),
    ),
  );

/** One figure's worst key spread over its unsquashed frames, unread at its first unread frame or where it has none. */
const keyHeightSample = (name: string, still: ReadonlyArray<FrameRead>): Sample => {
  const unread = still.flatMap((f) =>
    Option.toArray(Option.map(Result.getFailure(f.height), (why) => ({ frame: f.frame, why }))),
  )[0];
  if (unread) return unreadAt(`${name} frame ${unread.frame}: ${unread.why}`);
  const keys = [...Map.groupBy(still, (f) => f.cell)].flatMap(([cell, held]) =>
    Option.toArray(
      Option.map(
        keySpread(
          held.flatMap((f) =>
            Option.toArray(Option.map(Result.getSuccess(f.height), (h) => h / f.zoom)),
          ),
        ),
        (s) => ({ cell, ...s }),
      ),
    ),
  );
  const worst = Option.fromUndefinedOr(keys.toSorted((a, b) => b.spread - a.spread)[0]);
  return Option.match(worst, {
    onNone: () => unreadAt(`${name}: no unsquashed frame to read its height`),
    onSome: (k) => one(`${name}/${k.cell} over ${k.frames} frames`, k.spread),
  });
};

/** The INFO lines verdict.md carries for the height bar, per figure: how many frames the view cuts were read whole off its analysis render, and how many squashed frames the bar leaves out; each only where it is not none. */
export const heightInfo = (reads: ReadonlyArray<FrameRead>): ReadonlyArray<string> =>
  [...Map.groupBy(reads, (r) => r.name)].flatMap(([name, frames]) => {
    const cut = frames.filter(
      (f) => !f.squashed && !f.read.whole && Result.isSuccess(f.height),
    ).length;
    const squashed = frames.filter((f) => f.squashed).length;
    return [
      {
        n: cut,
        line: `render-height cut: ${name} read whole off its analysis render in ${cut} frames the view cuts`,
      },
      { n: squashed, line: `render-height squash: ${name} leaves out ${squashed} squashed frames` },
    ].flatMap((x) => [x.line].filter(() => x.n > 0));
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
