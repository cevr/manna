import type { Raster } from '@manna/film/tools';
import { Option } from 'effect';
import { alphaAt, anchorOf, type Lines, medianOf } from '../sheet.ts';
import type { FigureFrame, Frame, Shot } from '../shot.ts';
import { drawnCellOf, type StoredFigure } from '../store.ts';
import { planeOf } from './covers.ts';

/** How a cell's px land in a frame: its anchor (`ax`, `ay`, cell px) at frame px (`x`, `y`), each cell px `sx` across and `sy` down. */
export interface Placement {
  readonly x: number;
  readonly y: number;
  readonly sx: number;
  readonly sy: number;
}

/** The least alpha a render's pixel holds to count as the figure's. */
const SEEN_ALPHA = 128;

/** The first row of column `x` of `r` at or past `SEEN_ALPHA`, none when the column holds none. */
const topOf = (r: Raster, x: number, least: number): Option.Option<number> => {
  for (let y = 0; y < r.height; y++)
    if (alphaAt(r, y * r.width + x) >= least) return Option.some(y);
  return Option.none();
};

/**
 * A figure's crown-to-soles height in a frame that cuts it, read off the
 * columns its render shows: for each column of its cell whose top lies in
 * the upper half of its height, the rows from that column's top in the
 * render (where the frame does not cut it) down to the soles' row the
 * placement pins, over the same rows in the cell; the median of those, times
 * the cell's crown-to-soles. So a close that cuts its soles, or a frame that
 * shows only a sliver of its side, still reads how tall it is drawn while
 * its key holds; none when no such column shows.
 */
export const seenHeight = (
  cell: Raster,
  lines: Lines,
  place: Placement,
  render: Raster,
): Option.Option<number> => {
  const { ax, ay } = anchorOf(lines);
  const tall = ay - lines.crown;
  const ratios = Array.from({ length: cell.width }, (_, u) => u).flatMap((u) => {
    const x = Math.floor(place.x + (u + 0.5 - ax) * place.sx);
    if (x < 0 || x >= render.width) return [];
    const drawn = Option.filter(topOf(cell, u, 1), (d) => ay - d >= tall / 2);
    return Option.toArray(
      Option.flatMap(drawn, (d) =>
        Option.map(
          Option.filter(topOf(render, x, SEEN_ALPHA), (s) => s > 0),
          (s) => (place.y - s) / (ay - d),
        ),
      ),
    );
  });
  return Option.map(medianOf(ratios), (r) => r * tall);
};

/** Where the page lays figure `f`'s drawn cell in `frame`: its place, draw scale, squash and breath, then its plane's pan and zoom. */
export const placementOf = (shot: Shot, frame: Frame, f: FigureFrame, z: number): Placement => {
  const plane = planeOf(shot.size, z, frame.camera);
  return {
    x: f.x * plane.scale + plane.ox,
    y: f.y * plane.scale + plane.oy,
    sx: f.scale * f.sx * plane.scale,
    sy: f.scale * f.sy * f.breath * plane.scale,
  };
};

/** `seenHeight` of stored figure `stored` as `frame` places it, read on its figure-alone `render`; none when its cell reads no lines. */
export const seenHeightOf = (
  shot: Shot,
  frame: Frame,
  f: FigureFrame,
  stored: StoredFigure,
  render: Raster,
): Option.Option<number> =>
  Option.flatMap(
    Option.all([
      drawnCellOf(stored, f.cell),
      Option.flatten(Option.fromUndefinedOr(stored.lines.get(f.cell))),
    ]),
    ([cell, lines]) => seenHeight(cell, lines, placementOf(shot, frame, f, stored.layer.z), render),
  );
