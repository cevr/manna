import { Array as Arr, Option } from 'effect';
import { type SheetMeasure, type SheetOptions, standingOf, statureOf } from './cast-sheet.ts';
import {
  besideRaster,
  cropRaster,
  type Raster,
  type RasterPath,
  scaleRaster,
  stackRaster,
  strokeRaster,
  stretchRaster,
} from './raster.ts';

const PREVIEW_HEAD = 120;
const GAP = 24;
const BAND: readonly [number, number, number] = [0, 170, 90];

type View = SheetMeasure['views'][number];

const headOf = (
  v: View,
  heads: number,
  anchor: Option.Option<{ readonly view: View; readonly heads: number }>,
): number =>
  Option.getOrElse(Option.fromUndefinedOr(v.head), () =>
    Option.getOrElse(
      Option.flatMap(anchor, (a) =>
        Option.map(
          Option.fromUndefinedOr(a.view.head),
          (head) => (head * (v.height / heads)) / (a.view.height / a.heads),
        ),
      ),
      () => v.height / heads,
    ),
  );

const normalised = (
  sheet: Raster,
  v: View,
  headPx: number,
  stands: boolean,
  heads: number,
): Raster => {
  const [x0, y0, x1, y1] = v.box;
  const f = PREVIEW_HEAD / headPx;
  const chin = Math.min(y1 - 1, y0 + headPx);
  if (!stands || chin >= y1 - 1) return scaleRaster(cropRaster(sheet, v.box), f);
  const body = (heads - 1) * PREVIEW_HEAD;
  return stackRaster([
    scaleRaster(cropRaster(sheet, [x0, y0, x1, chin]), f),
    stretchRaster(cropRaster(sheet, [x0, chin, x1, y1]), f, body / (y1 - chin)),
  ]);
};

export const sheetPreview = (sheet: Raster, m: SheetMeasure, options: SheetOptions): Raster => {
  const anchorHeads = statureOf(options, m.anchor).heads;
  const anchor = Option.map(Arr.get(m.views, m.anchor - 1), (view) => ({
    view,
    heads: anchorHeads,
  }));
  const standing = standingOf(options, m.views);
  const bodies = m.kind !== 'heads';
  const traced = bodies && options.headgear !== true;
  const row = besideRaster(
    m.views.map((v) => {
      const { heads } = statureOf(options, v.view);
      return {
        raster: normalised(
          sheet,
          v,
          headOf(v, heads, anchor),
          traced && standing.includes(v.view),
          heads,
        ),
        top: 0,
      };
    }),
    GAP,
  );
  const across = (y: number): RasterPath => ({
    points: [
      [0, y],
      [row.width, y],
    ],
    closed: false,
  });
  const band = [GAP, GAP + PREVIEW_HEAD, ...((traced && [GAP + anchorHeads * PREVIEW_HEAD]) || [])];
  return strokeRaster(row, band.map(across), BAND, 2);
};
