// The feast's crowd: the filler bases' busts (`crowdOf`, the story crowd kit)
// seated in two rows behind the long table, as `cold.letter.4` has them
// between the guests' heads: a back row, smaller, higher and hazier, at a
// table of its own, and a front row, larger and lower, at the far table in
// front of it, each row on its own plane. Placements are in the kept panel's
// px on a row's plane (`PANEL`); `cold` draws the back row's plane, then the
// front row's, between the near plate and the guests, each bust under its
// row's table.

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
 * The two rows. The back row sits 56 panel px higher at about three quarters
 * of the front's size, so its heads show over and between the front row's;
 * its table is long enough to run past the widest framing (`smile`) on its
 * plane. The front row's table lies low enough that its face and legs end
 * behind the guests and the long table's props. Each haze pulls the row
 * toward a pale warm light (a contrast under 1 and a brightness over 1 move
 * every channel toward about 0.8, the courtyard's far stone) and takes some
 * of its colour: the back row more, so it reads paler and cooler, as
 * `cold.letter.4`'s farthest heads do; the ink goes a soft brown with it.
 */
export const CROWD_ROWS = {
  back: {
    z: 1.65,
    top: 682,
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
    haze: 'contrast(0.84) brightness(1.07) saturate(0.86)',
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

/** One bust of the crowd: its figure, its row, its neck's x and its table top, panel px, its scale, and its lean in radians. */
export interface Seat {
  readonly figure: Figure;
  readonly row: RowName;
  readonly x: number;
  readonly top: number;
  readonly scale: number;
  readonly lean: number;
}

/** The row of the `i`th seat from the left: even seats back, odd front. */
const rowAt = (i: number): RowName => {
  if (i % 2 === 0) return 'back';
  return 'front';
};

/** The crowd's seats, left to right, from its seed: the figures from the kit's mix, the spread and jitter from a draw of its own. */
export const FEAST_SEATS: ReadonlyArray<Seat> = (() => {
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
  // How far the seat `j` lies from `at`, panel px; past either end, never nearer.
  const apart = (at: number, j: number) =>
    Option.match(Arr.get(xs, j), { onNone: () => Infinity, onSome: (o) => Math.abs(o - at) });
  return Arr.zip(crowdOf(seed, count), xs).map(([figure, at], i) => {
    const row = rowAt(i);
    const top = CROWD_ROWS[row].top + rise * (2 * draw() - 1);
    const scale = CROWD_ROWS[row].scale * (1 + size * (2 * draw() - 1));
    const tilt = lean[0] + (lean[1] - lean[0]) * draw();
    // Toward the nearer neighbour in its row, two seats over: right is a positive turn.
    const toward = Math.sign(apart(at, i - 2) - apart(at, i + 2));
    return { figure, row, x: at, top, scale, lean: (toward * tilt * Math.PI) / 180 };
  });
})();

/** A row's seats, back to front within it: the higher top, the farther, drawn first. */
export const seatsOf = (row: RowName): ReadonlyArray<Seat> =>
  FEAST_SEATS.filter((s) => s.row === row).toSorted((a, b) => a.top - b.top);

/**
 * Draw one crowd row in the panel's px of its plane: each bust whose span
 * (`x` +- its half) `shown` keeps, in its idle and its lean, then the row's
 * table over their lower halves (`table` draws the table plate at its own
 * frame px). A bust's size is the canvas's scale, its pose at scale 1: the
 * puppet's line and its reach are sheet px times the canvas's scale alone
 * (`passOf` in `packages/film/src/canvas/puppet.ts`), so at a pose's scale of
 * 0.2 the line would be drawn five times too wide, over the hair and robe.
 */
export const drawCrowdRow = (
  f: CrowdFrame,
  row: RowName,
  shown: (left: number, right: number) => boolean,
  table: () => void,
): void => {
  const { ctx } = f;
  for (const seat of seatsOf(row)) {
    const half = FEAST_CROWD.half * seat.scale;
    if (!shown(seat.x - half, seat.x + half)) continue;
    ctx.save();
    ctx.translate(seat.x, seat.top);
    ctx.rotate(seat.lean);
    ctx.scale(seat.scale, seat.scale);
    drawBust(f, seat.figure, { x: 0, top: 0, scale: 1 });
    ctx.restore();
  }
  const s = CROWD_ROWS[row].table / PANEL.scale;
  ctx.save();
  ctx.translate(FEAST_CROWD.table.x, CROWD_ROWS[row].top);
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
