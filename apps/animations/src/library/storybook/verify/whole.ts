import { Option } from 'effect';
import { anchorOf, type Box } from '../sheet.ts';
import { type Frame, frameAt, type Shot, timesOf } from '../shot.ts';
import { drawnCellOf, type StoredFigure } from '../store.ts';
import { planeOf } from './covers.ts';
import { opaqueBox } from './measures.ts';

/**
 * Whether a figure of `frame` lies whole inside the frame, clear of every
 * edge, as the page paints it: its drawn key's opaque box pinned by its
 * anchor at its place, scaled by its draw scale, squash and breath, then by
 * its plane's pan and zoom.
 */
const wholeAt = (
  shot: Shot,
  frame: Frame,
  stored: StoredFigure,
  boxOf: (key: string) => Option.Option<Box>,
): boolean => {
  const f = frame.figures.find((g) => g.name === stored.figure.name);
  if (!f) return false;
  const placed = Option.all([
    Option.flatten(Option.fromUndefinedOr(stored.lines.get(f.cell))),
    boxOf(f.cell),
  ]);
  return Option.exists(placed, ([lines, box]) => {
    const { ax, ay } = anchorOf(lines);
    const plane = planeOf(shot.size, stored.layer.z, frame.camera);
    const sx = f.scale * f.sx;
    const sy = f.scale * f.sy * f.breath;
    const x0 = (f.x + (box.x - ax) * sx) * plane.scale + plane.ox;
    const x1 = (f.x + (box.x + box.width - ax) * sx) * plane.scale + plane.ox;
    const y0 = (f.y + (box.y - ay) * sy) * plane.scale + plane.oy;
    const y1 = (f.y + (box.y + box.height - ay) * sy) * plane.scale + plane.oy;
    return x0 > 0 && y0 > 0 && x1 < shot.size.width && y1 < shot.size.height;
  });
};

/** The figures, by name (one person of the scene in every shot of it, as the filler kit's one member is several people), that lie whole inside the frame in some frame of `shot`, as its plan places them (`frameAt` with the figures' sheet heads and head shares). */
export const wholeFigures = (
  shot: Shot,
  figures: ReadonlyArray<StoredFigure>,
  heads: ReadonlyMap<string, number>,
  shares: ReadonlyMap<string, number>,
): ReadonlySet<string> => {
  const frames = timesOf(shot).map((t) => frameAt(shot, heads, t, shares));
  return new Set(
    figures
      .filter((stored) => {
        const boxes = new Map<string, Option.Option<Box>>();
        const boxOf = (key: string) => {
          const known = boxes.get(key) ?? Option.flatMap(drawnCellOf(stored, key), opaqueBox);
          boxes.set(key, known);
          return known;
        };
        return frames.some((frame) => wholeAt(shot, frame, stored, boxOf));
      })
      .map((stored) => stored.figure.name),
  );
};
