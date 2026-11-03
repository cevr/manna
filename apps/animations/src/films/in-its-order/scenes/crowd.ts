import {
  type CrowdFrame,
  type Figure,
  crowdOf,
  drawBust,
} from '../../../library/cast/filler-bases/cutout/crowd.ts';
import { rng } from '@manna/film/core';
import { Array as Arr, Option } from 'effect';
import { PANEL } from '../plates/plates.ts';

/**
 * One row of the crowd, panel px on its plane. The plane stands `z` back, as
 * a camera's divisor, between the near plate (2) and the guests (1.15). Its
 * table's top crosses its busts at `top`, and a bust is `scale` panel px a
 * sheet px before its own jitter. The row is drawn through `haze`, a canvas
 * filter after a blur of `blur` screen px at 1920: the panel's far crowd is
 * soft, paler and flatter than the guests, the back row the most. Its table
 * is the far table's plate (`FAR_TABLE` in `plates.ts`) drawn `table` times
 * its frame size, its point `on` (the back edge of its top at the plate's
 * middle, drawing px) on the row's top at panel x `x`.
 */
export interface CrowdRow {
  readonly z: number;
  readonly top: number;
  readonly scale: number;
  readonly blur: number;
  readonly haze: string;
  readonly table: number;
}

/**
 * The two rows. The back row sits 68 panel px higher at about three quarters
 * of the front's size, so its heads show over and between the front row's;
 * its table is long enough to run past the widest framing (`smile`) on its
 * plane. The front row's table lies low enough that its face and legs end
 * behind the guests and the long table's props. Each haze pulls the row
 * toward a pale warm light (a contrast under 1 and a brightness over 1 move
 * every channel toward about 0.8, the courtyard's far stone) and takes some
 * of its colour: the back row much more, so it reads paler and cooler, as
 * `cold.letter.4`'s farthest heads do; the ink goes a soft brown with it. The
 * front row's haze is light, so its dyed veils, mantles and bands keep their
 * kit cloths (walnut, indigo, olive, camel) and do not wash to linen.
 */
export const CROWD_ROWS = {
  back: {
    z: 1.65,
    top: 670,
    scale: 0.18,
    blur: 2.6,
    haze: 'contrast(0.74) brightness(1.1) saturate(0.76)',
    table: 0.66,
  },
  front: {
    z: 1.42,
    top: 738,
    scale: 0.235,
    blur: 1.7,
    haze: 'contrast(0.94) brightness(1.04) saturate(0.96)',
    table: 0.74,
  },
} as const satisfies Record<string, CrowdRow>;

/**
 * The shade under each crowd table, in the table plate's drawing px: from
 * just under its top's face (`from`, below the plate's `on` row) it darkens to
 * `alpha` of `colour` by `full` and holds to the plate's bottom, so the legs
 * stand in shade and no pale paving shows between them and the guests.
 */
export const TABLE_SHADE = { from: 58, full: 74, to: 276, alpha: 0.55, colour: '#5a3a28' } as const;

export type RowName = keyof typeof CROWD_ROWS;

/**
 * The crowd's mix and spread: `count` figures of seed `seed`, their necks
 * spread from panel x `from` to `to` with gaps drawn between `gap[0]` and
 * `gap[1]` times the even gap, so some sit close as a cluster and some apart;
 * left to right they alternate back row and front row, so the kit's rule on
 * neighbours holds across the rows as the eye reads them. Each figure's size
 * is its row's times 1 +- `size`, its top +- `rise` panel px, and it leans
 * `lean[0]..lean[1]` degrees toward the nearer of its row's neighbours, as
 * if turned to talk. A bust is culled by `half` sheet px either side of its
 * neck.
 */
export const FEAST_CROWD = {
  seed: 7,
  count: 15,
  from: 300,
  to: 1225,
  gap: [0.45, 1.55],
  size: 0.07,
  rise: 4,
  lean: [1.5, 4],
  half: 170,
  table: { x: 762, on: [960, 968] },
} as const;

/** One bust of a crowd: its figure, its neck's x and its table top, panel px, its scale, and its lean in radians. */
export interface Seat {
  readonly figure: Figure;
  readonly x: number;
  readonly top: number;
  readonly scale: number;
  readonly lean: number;
}

/** A bust of the feast's crowd, and its row. */
export interface RowSeat extends Seat {
  readonly row: RowName;
}

/**
 * A small crowd seated at one table, panel px on its plane: `necks.length`
 * figures of seed `seed` (`crowdOf`), their necks at `necks`, left to right,
 * so the kit's rule on neighbours holds as the eye reads them; its table's
 * top crosses them at `top`, each bust `scale` panel px a sheet px. Each is
 * `1 +- size` of that, its top `+- rise` panel px, and it leans as the
 * feast's crowd does (`FEAST_CROWD`'s `lean`), toward the nearer of its
 * neighbours.
 */
export interface Gathering {
  readonly seed: number;
  readonly necks: ReadonlyArray<number>;
  readonly top: number;
  readonly scale: number;
  readonly size: number;
  readonly rise: number;
}

/**
 * The title's crowd (`title.start.2`): three busts at each end of the long
 * table on the guests' plane, either side of the man guest (544) and of the
 * mother behind the woman (1012), so the table reads full as the panel's
 * does. Each is the front row's size, its face about as wide as the guests'
 * (46 panel px) and its crown about level with theirs; its table top lies
 * just under the long table's back edge (panel 860), so the table plate in
 * front hides its waist.
 */
export const TITLE_CROWD = {
  seed: 23,
  necks: [132, 260, 390, 1150, 1280, 1410],
  top: 864,
  scale: 0.4,
  size: 0.05,
  rise: 4,
} as const satisfies Gathering;

/** A gathering at a far table on a plane of its own (`BABY_CROWD`). */
export interface FarGathering extends Gathering {
  readonly z: number;
  readonly x: number;
  readonly table: number;
  readonly blur: number;
  readonly haze: string;
}

/**
 * The baby close's crowd (`cold.baby.3`): nine busts at a far table on a
 * plane of their own between `BABY_BACK` and the mother, as the panel seats
 * them: four left of her, one at her right shoulder, half behind her, and
 * four right of her, their heads 110-140 panel px across with their cloths
 * and their crowns about 1.6 heads over the table, in sizes and heights
 * varied enough that the row does not read as one even line.
 * The plane stands `z` back; its table is the far table's plate drawn `table`
 * times its frame size at panel x `x`, its top at `top`; the row is soft
 * through `blur` (screen px at 1920) and `haze`, as the panel's crowd is, and
 * keeps its colours.
 */
export const BABY_CROWD = {
  seed: 19,
  necks: [62, 190, 318, 440, 1040, 1140, 1260, 1376, 1490],
  top: 606,
  scale: 0.55,
  size: 0.1,
  rise: 12,
  z: 2,
  x: 768,
  table: 1.5,
  blur: 3,
  haze: 'contrast(0.95) brightness(1.03)',
} as const satisfies FarGathering;

/** A gathering's seats, left to right: the figures from the kit's mix, the jitter and lean from a draw of its own. */
export const seatsAt = (g: Gathering): ReadonlyArray<Seat> => {
  const { size, rise } = g;
  const { lean } = FEAST_CROWD;
  const draw = rng(g.seed * 7919 + 1);
  const apart = (at: number, j: number) =>
    Option.match(Arr.get(g.necks, j), { onNone: () => Infinity, onSome: (o) => Math.abs(o - at) });
  return Arr.zip(crowdOf(g.seed, g.necks.length), g.necks).map(([figure, x], i) => {
    const top = g.top + rise * (2 * draw() - 1);
    const scale = g.scale * (1 + size * (2 * draw() - 1));
    const tilt = lean[0] + (lean[1] - lean[0]) * draw();
    const toward = Math.sign(apart(x, i - 1) - apart(x, i + 1));
    return { figure, x, top, scale, lean: (toward * tilt * Math.PI) / 180 };
  });
};

/** The title's seats (`TITLE_CROWD`). */
export const TITLE_SEATS = seatsAt(TITLE_CROWD);

/** The baby close's seats (`BABY_CROWD`). */
export const BABY_SEATS = seatsAt(BABY_CROWD);

/** The row of the `i`th seat from the left: even seats back, odd front. */
const rowAt = (i: number): RowName => {
  if (i % 2 === 0) return 'back';
  return 'front';
};

/** The crowd's seats, left to right, from its seed: the figures from the kit's mix, the spread and jitter from a draw of its own. */
export const FEAST_SEATS: ReadonlyArray<RowSeat> = (() => {
  const { seed, count, from, to, gap, size, rise, lean } = FEAST_CROWD;
  const draw = rng(seed * 7919 + 1);
  const gaps = Array.from({ length: count - 1 }, () => gap[0] + (gap[1] - gap[0]) * draw());
  const total = gaps.reduce((a, b) => a + b, 0);
  const xs: Array<number> = [from];
  let x: number = from;
  for (const g of gaps) {
    x += ((to - from) * g) / total;
    xs.push(x);
  }
  const apart = (at: number, j: number) =>
    Option.match(Arr.get(xs, j), { onNone: () => Infinity, onSome: (o) => Math.abs(o - at) });
  return Arr.zip(crowdOf(seed, count), xs).map(([figure, at], i) => {
    const row = rowAt(i);
    const top = CROWD_ROWS[row].top + rise * (2 * draw() - 1);
    const scale = CROWD_ROWS[row].scale * (1 + size * (2 * draw() - 1));
    const tilt = lean[0] + (lean[1] - lean[0]) * draw();
    const toward = Math.sign(apart(at, i - 2) - apart(at, i + 2));
    return { figure, row, x: at, top, scale, lean: (toward * tilt * Math.PI) / 180 };
  });
})();

/** A row's seats. */
export const seatsOf = (row: RowName): ReadonlyArray<Seat> =>
  FEAST_SEATS.filter((s) => s.row === row);

/**
 * Draw `seats` in the panel's px of their plane, the higher top, the
 * farther, first: each bust whose span (`x` +- its half) `shown` keeps, in
 * its idle and its lean. A bust's size is the canvas's scale, its pose at
 * scale 1: the puppet's line and its reach are sheet px times the canvas's
 * scale alone (`passOf` in `packages/film/src/canvas/puppet.ts`), so at a
 * pose's scale of 0.2 the line would be drawn five times too wide, over the
 * hair and robe.
 */
export const drawSeats = (
  f: CrowdFrame,
  seats: ReadonlyArray<Seat>,
  shown: (left: number, right: number) => boolean = () => true,
): void => {
  const { ctx } = f;
  for (const seat of seats.toSorted((a, b) => a.top - b.top)) {
    const half = FEAST_CROWD.half * seat.scale;
    if (!shown(seat.x - half, seat.x + half)) continue;
    ctx.save();
    ctx.translate(seat.x, seat.top);
    ctx.rotate(seat.lean);
    ctx.scale(seat.scale, seat.scale);
    drawBust(f, seat.figure, { x: 0, top: 0, scale: 1 });
    ctx.restore();
  }
};

/**
 * Draw a crowd's table in the panel's px of its plane: the far table's plate
 * (`table` draws it at its own frame px) `size` times its frame size, its
 * point `on` on the top at panel (`x`, `top`), and the shade under its top
 * (`TABLE_SHADE`).
 */
export const drawCrowdTable = (
  ctx: CanvasRenderingContext2D,
  at: { readonly x: number; readonly top: number; readonly size: number },
  table: () => void,
): void => {
  const s = at.size / PANEL.scale;
  ctx.save();
  ctx.translate(at.x, at.top);
  ctx.scale(s, s);
  ctx.translate(-FEAST_CROWD.table.on[0], -FEAST_CROWD.table.on[1]);
  table();
  const { from, full, to, alpha, colour } = TABLE_SHADE;
  const y = FEAST_CROWD.table.on[1];
  const shade = ctx.createLinearGradient(0, y + from, 0, y + full);
  shade.addColorStop(0, `${colour}00`);
  shade.addColorStop(1, colour);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = shade;
  ctx.fillRect(0, y + from, 1920, to - from);
  ctx.restore();
};

/** Draw one row of the feast's crowd (`drawSeats`), then its table over their lower halves (`drawCrowdTable`). */
export const drawCrowdRow = (
  f: CrowdFrame,
  row: RowName,
  shown: (left: number, right: number) => boolean,
  table: () => void,
): void => {
  drawSeats(f, seatsOf(row), shown);
  const { top, table: size } = CROWD_ROWS[row];
  drawCrowdTable(f.ctx, { x: FEAST_CROWD.table.x, top, size }, table);
};
