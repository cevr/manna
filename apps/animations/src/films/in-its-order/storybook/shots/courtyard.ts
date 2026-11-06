import type { Figure, Layer } from '../../../../library/storybook/shot.ts';
import { DISTANCE, FAR_TABLE, NEAR, SKY, TABLE } from '../../plates/plates.ts';
import { layer, plateOf, seat, STORY_PLATES } from '../kit.ts';
import { TABLE_CLOSE, TABLE_CLOSE_BOX } from '../plates/table-close.ts';

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

/** The long table's middle as cold-ouch's close shows it: `table.png`'s `TABLE_CLOSE_BOX` painted again at 2.4 times its size, laid exactly over that box, so the close enlarges it under 1.5×. */
export const tableClose = () =>
  plateOf('table-close.png', TABLE_CLOSE, {
    at: [TABLE.at[0] + TABLE_CLOSE_BOX.x, TABLE.at[1] + TABLE_CLOSE_BOX.y],
    scale: TABLE_CLOSE_BOX.width / TABLE_CLOSE.size[0],
    dir: STORY_PLATES,
  });

/** The long table's top in its plane's px: its back edge at 961 and its front edge at 985, as `table.png`'s wood reads 100 px up. */
export const TABLE_TOP = { x: 0, y: 961, width: 1920, height: 24 } as const;

/** The far table the diners sit behind, on their plane, a fifth wider than the frame so a truck never shows its ends. */
export const farTable = () =>
  plateOf('far-table.png', FAR_TABLE, { at: [-192, FAR_TABLE.at[1]], scale: 1.2 });

/** The three at the table on its plane: the man at picture left, the lead in the middle, the woman at picture right, each crown where the panel draws it. */
export const AT_TABLE = {
  man: { x: 730, crown: 760 },
  lead: { x: 960, crown: 744 },
  woman: { x: 1190, crown: 760 },
} as const;

/**
 * The diners' row behind on its plane, left to right, and the mother at its
 * right: their crowns high enough that every chin clears the far table's top
 * (840), each seen whole between the three at the table under the table's
 * medium (zoom 1.9 to 1.95): two left of the man, one between him and the
 * lead (clear of the letter the lead reads beside his face in cold-letter),
 * one between the lead and the woman, the mother right of her.
 */
export const DINERS_ROW = {
  crown: 700,
  xs: [470, 590, 800, 1100],
  mother: { x: 1400, crown: 712 },
} as const;

/** The four dressed diners, each on its own sheet, the side each `talk` turns to. */
export const DINERS = [1, 2, 3, 4] as const;

/**
 * What diners 1 and 2 wear in other colours, so neither doubles a guest
 * (critique 1, item 9; the owner's O3): diner 1's pale headcloth (the
 * palette's grey-beige) in ochre, his band (its indigo) in rust and his vest
 * (its walnut) in slate, beside the guest man's white headcloth, blue band
 * and brown vest; diner 2's veil and mantle (its olive) in a madder rose,
 * beside the guest woman's green.
 */
export const DINER_DRESS: ReadonlyMap<number, Figure['dress']> = new Map([
  [
    1,
    [
      { from: '#e1cfbd', to: '#d9b56c' },
      { from: '#4b566b', to: '#a4553a' },
      { from: '#ab8163', to: '#66778f' },
    ],
  ],
  [2, [{ from: '#768059', to: '#b3786a' }]],
]);

/** Diner `n` at `x`, its crown at `crown`, on a plane at `z` under a grown head of `headPx`, in its dress. */
export const diner = (
  n: (typeof DINERS)[number],
  x: number,
  crown: number,
  at: { readonly headPx: number; readonly z: number },
  spans: Figure['spans'],
): Figure =>
  seat(
    {
      member: 'filler-dressed',
      sheet: `iio-diner-${n}`,
      name: `diner-${n}`,
      x,
      crown,
      dress: DINER_DRESS.get(n) ?? [],
    },
    at,
    spans,
  );
