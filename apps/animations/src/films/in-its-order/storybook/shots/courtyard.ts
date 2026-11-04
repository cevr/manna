import type { Figure, Layer } from '../../../../library/storybook/shot.ts';
import { DISTANCE, FAR_TABLE, NEAR, SKY, TABLE } from '../../plates/plates.ts';
import { layer, plateOf, seat } from '../kit.ts';

/**
 * A grown head (crown to collar) on the table's plane in the courtyard's
 * world, px: the frame px of the title's wide, where every courtyard plate
 * is painted, so every courtyard shot sizes its cast alike and frames it
 * with the camera.
 */
export const HEAD = 120;

/** How far each courtyard plane stands, as a camera's divisor. */
export const Z = { sky: 12, distance: 5, near: 2, diners: 1.4, guests: 1.15, table: 1 } as const;

/** The courtyard behind its people: the sky, the hills and town, and the near pergola, each on its plane. */
export const backdrop = (): ReadonlyArray<Layer> => [
  layer('sky', Z.sky, [plateOf('sky.png', SKY)]),
  layer('distance', Z.distance, [plateOf('distance.png', DISTANCE)]),
  layer('near', Z.near, [plateOf('near.png', NEAR)]),
];

/** The long table in front, on the table's plane: every chin at the table sits above its top (frame y 915 at its highest). */
export const table = () => plateOf('table.png', TABLE);

/** The far table the diners sit behind, on their plane, a fifth wider than the frame so a truck never shows its ends. */
export const farTable = () =>
  plateOf('far-table.png', FAR_TABLE, { at: [-192, FAR_TABLE.at[1]], scale: 1.2 });

/** The three at the table on its plane: the man at picture left, the lead in the middle, the woman at picture right, each crown where the panel draws it. */
export const AT_TABLE = {
  man: { x: 730, crown: 760 },
  lead: { x: 960, crown: 744 },
  woman: { x: 1190, crown: 760 },
} as const;

/** The diners' row behind on its plane, left to right, and the mother at its far right: their crowns high enough that every chin clears the far table's top (840). */
export const DINERS_ROW = {
  crown: 700,
  xs: [180, 420, 1440, 1640],
  mother: { x: 1830, crown: 712 },
} as const;

/** The four dressed diners, each on its own sheet, the side each `talk` turns to. */
export const DINERS = [1, 2, 3, 4] as const;

/** Diner `n` at `x`, its crown at `crown`, on a plane at `z` under a grown head of `headPx`. */
export const diner = (
  n: (typeof DINERS)[number],
  x: number,
  crown: number,
  at: { readonly headPx: number; readonly z: number },
  spans: Figure['spans'],
): Figure =>
  seat(
    { member: 'filler-dressed', sheet: `iio-diner-${n}`, name: `diner-${n}`, x, crown },
    at,
    spans,
  );
