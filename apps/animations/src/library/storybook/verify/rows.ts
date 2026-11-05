import { Option, Result } from 'effect';
import { anchorOf, type Box } from '../sheet.ts';
import { drawnKeyOf, type FigureFrame, type Frame, type Shot } from '../shot.ts';
import { drawnCellOf, type StoredFigure } from '../store.ts';
import { planeOf } from './covers.ts';

/** How a cell's px land in a frame: its anchor (`ax`, `ay`, cell px) at frame px (`x`, `y`), each cell px `sx` across and `sy` down. */
export interface Placement {
  readonly x: number;
  readonly y: number;
  readonly sx: number;
  readonly sy: number;
}

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

/** The clear frame px an analysis surface keeps round a figure's whole placed cell, beyond three times its layer's blur. */
export const ANALYSIS_MARGIN = 8;

/** The longest side, in px, of an analysis surface the page is asked to paint. */
export const ANALYSIS_SIDE = 12000;

/**
 * The analysis surface of a cell `size` px whose anchor (`ax`, `ay`) lands
 * at `place`: the frame-px rectangle, in whole px, round the whole placed
 * cell with `ANALYSIS_MARGIN` and three times `blur` clear on every side.
 * The page paints the figure's own transform into it, moved by whole px
 * only, so the frame's crop never cuts the figure. It only allocates: the
 * height is read off the pixels painted into it, never off this box.
 */
export const analysisBoxOf = (
  place: Placement,
  cell: {
    readonly width: number;
    readonly height: number;
    readonly ax: number;
    readonly ay: number;
  },
  blur: number,
): Box => {
  const xs = [place.x - cell.ax * place.sx, place.x + (cell.width - cell.ax) * place.sx];
  const ys = [place.y - cell.ay * place.sy, place.y + (cell.height - cell.ay) * place.sy];
  const m = ANALYSIS_MARGIN + Math.ceil(3 * blur);
  const [x0, y0] = [Math.floor(Math.min(...xs)) - m, Math.floor(Math.min(...ys)) - m];
  const [x1, y1] = [Math.ceil(Math.max(...xs)) + m, Math.ceil(Math.max(...ys)) + m];
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
};

/**
 * The analysis surface of stored figure `stored` as `frame` places `f`:
 * its drawn key's whole picture (`drawnCellOf`) at its anchor (its cell's
 * soles' centre, the cell's bottom middle where its lines read none),
 * through `analysisBoxOf`. Why not where the frame squashes it, it draws a
 * key it holds no picture of, or the surface would pass `ANALYSIS_SIDE`.
 */
export const analysisOf = (
  shot: Shot,
  frame: Frame,
  f: FigureFrame,
  stored: StoredFigure,
): Result.Result<Box, string> => {
  if (f.sx !== 1 || f.sy !== 1) return Result.fail('squashed by a turn');
  const key = drawnKeyOf(f);
  return Option.match(drawnCellOf(stored, key), {
    onNone: () => Result.fail(`no picture of ${key}`),
    onSome: (cell) => {
      const anchor = Option.match(
        Option.flatten(Option.fromUndefinedOr(stored.lines.get(f.cell))),
        {
          onNone: () => ({ ax: cell.width / 2, ay: cell.height }),
          onSome: anchorOf,
        },
      );
      const box = analysisBoxOf(
        placementOf(shot, frame, f, stored.layer.z),
        { width: cell.width, height: cell.height, ...anchor },
        stored.layer.blur,
      );
      if (Math.max(box.width, box.height) > ANALYSIS_SIDE)
        return Result.fail(
          `its analysis surface ${box.width}x${box.height} passes ${ANALYSIS_SIDE} px`,
        );
      return Result.succeed(box);
    },
  });
};
