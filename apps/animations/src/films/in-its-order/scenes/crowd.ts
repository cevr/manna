import {
  type CrowdFrame,
  type Figure,
  crowdOf,
  drawBust,
} from '../../../library/cast/filler-bases/cutout/crowd.ts';
import { rng } from '@manna/film/core';
import { Array as Arr, Option } from 'effect';
import { PANEL } from '../plates/plates.ts';

export interface CrowdRow {
  readonly z: number;
  readonly top: number;
  readonly scale: number;
  readonly blur: number;
  readonly haze: string;
  readonly table: number;
}

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

export const TABLE_SHADE = { from: 58, full: 74, to: 276, alpha: 0.55, colour: '#5a3a28' } as const;

export type RowName = keyof typeof CROWD_ROWS;

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

export interface Seat {
  readonly figure: Figure;
  readonly x: number;
  readonly top: number;
  readonly scale: number;
  readonly lean: number;
}

export interface RowSeat extends Seat {
  readonly row: RowName;
}

export interface Gathering {
  readonly seed: number;
  readonly necks: ReadonlyArray<number>;
  readonly top: number;
  readonly scale: number;
  readonly size: number;
  readonly rise: number;
}

export const TITLE_CROWD = {
  seed: 23,
  necks: [132, 260, 390, 1150, 1280, 1410],
  top: 864,
  scale: 0.4,
  size: 0.05,
  rise: 4,
} as const satisfies Gathering;

export interface FarGathering extends Gathering {
  readonly z: number;
  readonly x: number;
  readonly table: number;
  readonly blur: number;
  readonly haze: string;
}

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

export const TITLE_SEATS = seatsAt(TITLE_CROWD);

export const BABY_SEATS = seatsAt(BABY_CROWD);

const rowAt = (i: number): RowName => {
  if (i % 2 === 0) return 'back';
  return 'front';
};

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

export const seatsOf = (row: RowName): ReadonlyArray<Seat> =>
  FEAST_SEATS.filter((s) => s.row === row);

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
