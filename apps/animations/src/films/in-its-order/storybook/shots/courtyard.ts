import type { Figure, Layer, Span } from '../../../../library/storybook/shot.ts';
import { figure } from '../../../../library/storybook/shot.ts';
import { DISTANCE, FAR_TABLE, NEAR, SKY, TABLE } from '../../plates/plates.ts';
import { sheetNamed } from '../sheets.ts';
import { layer, plateOf } from '../kit.ts';

/**
 * A grown head (crown to collar) on the table's plane in the courtyard's
 * world, px: the frame px of the title's wide, where every courtyard plate
 * is painted, so every courtyard shot sizes its cast alike and frames it
 * with the camera.
 */
export const HEAD = 120;

/** How far each courtyard plane stands, as a camera's divisor. */
export const Z = { sky: 12, distance: 5, near: 2, diners: 1.4, guests: 1.15, table: 1 } as const;

/** The keys a declared sheet holds, as a figure's spans may name them. */
export const keysOf = (member: string, id: string): ReadonlyArray<string> =>
  sheetNamed(member, id)?.keys ?? [];

/** A figure of the film on its declared sheet. */
export const cast = (
  member: string,
  sheet: string,
  name: string,
  at: { readonly x: number; readonly ground: number },
  spans: Figure['spans'],
  worn: Figure['worn'] = [],
): Figure => figure(keysOf(member, sheet), { name, member, sheet, at, spans, worn });

/** The courtyard behind its people: the sky, the hills and town, and the near pergola, each on its plane. */
export const backdrop = (): ReadonlyArray<Layer> => [
  layer('sky', Z.sky, [plateOf('sky.png', SKY)]),
  layer('distance', Z.distance, [plateOf('distance.png', DISTANCE)]),
  layer('near', Z.near, [plateOf('near.png', NEAR)]),
];

/** The long table in front, on the table's plane: every chin at the table sits above its top. */
export const table = () => plateOf('table.png', TABLE);

/** The far table the diners sit behind, on their plane, a fifth wider than the frame so a truck never shows its ends. */
export const farTable = () =>
  plateOf('far-table.png', FAR_TABLE, { at: [-192, FAR_TABLE.at[1]], scale: 1.2 });

/** A seated guest's holds through a shot: `[from, cell]` runs, each a blinking hold to the next, the last to `end`. */
export const holds = (
  runs: ReadonlyArray<readonly [number, string, string]>,
  end: number,
): ReadonlyArray<Span> =>
  runs.map(([from, cell, blink], i) => ({
    _tag: 'Hold',
    from,
    to: runs[i + 1]?.[0] ?? end,
    cell,
    blink,
  }));
