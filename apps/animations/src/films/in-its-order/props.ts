// In Its Order's props, plain canvas pieces the film's figures hold or stand
// beside (not rigs): the baby's bottle, the wooden plate, the low table and
// the stool. Each is drawn about a point in the units of the figure it goes
// with (the cast's canon, its origin the figure's feet), in the colours the
// kept sheets paint them, its paper creased at the house's light (`creaseOf`)
// with its far side turned toward the light's complement, and one ink line
// round it. The cast render lays them where the kept sheets draw them
// (`rigs/cast.ts`). Pure until drawn.

import { unprobed } from '@manna/film/canvas';
import { clamp } from '@manna/film/core';
import { boxOf, creaseOf } from '@manna/film/style';
import { palette } from './palette.ts';

type Pt = readonly [number, number];

/** The props' ink line, units: a little lighter than a figure's. */
const LINE = 4;

/** How softly a prop's paper turns at its crease, a share of the way along the light. */
const SOFT = 0.06;

/** A paper's lit colour and its shade, toward the light's complement, as the kept sheets paint them. */
const PAPER = {
  milk: { lit: '#fde9c8', shade: '#e6d0c4' },
  teat: { lit: palette.gold, shade: palette.goldShade },
  wood: { lit: '#8a5233', shade: '#5f4535' },
} as const;

/** A path round a box with round corners. */
const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
};

/** The current path filled in `paper` over the box from `from` to `to`, creased at the house's light, and inked round. */
const inked = (
  ctx: CanvasRenderingContext2D,
  paper: { readonly lit: string; readonly shade: string },
  from: Pt,
  to: Pt,
) => {
  const { start, end, at } = creaseOf(boxOf([from, to]));
  const g = ctx.createLinearGradient(start[0], start[1], end[0], end[1]);
  g.addColorStop(0, paper.lit);
  g.addColorStop(clamp(at - SOFT / 2), paper.lit);
  g.addColorStop(clamp(at + SOFT / 2), paper.shade);
  g.addColorStop(1, paper.shade);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = LINE;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = palette.outline;
  // The ink round a prop is its own edge, not a mark film check reads against text.
  unprobed(ctx, () => ctx.stroke());
};

/** The baby's bottle, its body's bottom middle at `at`: a cream body, its collar, its teat; `size` 1 is 33 units across and 48 tall. */
export const bottle =
  (at: Pt, size = 1) =>
  (ctx: CanvasRenderingContext2D) => {
    const [x, y] = at;
    const [w, h] = [33 * size, 48 * size];
    roundRect(ctx, x - w / 2, y - h, w, h, 9 * size);
    inked(ctx, PAPER.milk, [x - w / 2, y - h], [x + w / 2, y]);
    roundRect(ctx, x - 0.36 * w, y - h - 7 * size, 0.72 * w, 8 * size, 3 * size);
    inked(ctx, PAPER.milk, [x - 0.36 * w, y - h - 7 * size], [x + 0.36 * w, y - h + size]);
    ctx.beginPath();
    ctx.ellipse(x, y - h - 12 * size, 6 * size, 8 * size, 0, Math.PI, 2 * Math.PI);
    ctx.closePath();
    inked(ctx, PAPER.teat, [x - 6 * size, y - h - 20 * size], [x + 6 * size, y - h - 12 * size]);
  };

/** The plate's half width and its depth below its rim, units. */
const PLATE = { r: 44, deep: 28, rim: 9 } as const;

/**
 * The wooden plate, a deep dish held up at the mouth, its rim's middle at
 * `at`, tipped `tilt` radians (positive turns its open rim toward screen
 * right): its round body under its rim, and the dark of its inside within it.
 */
export const plate = (at: Pt, tilt: number) => (ctx: CanvasRenderingContext2D) => {
  const { r, deep, rim } = PLATE;
  ctx.save();
  ctx.translate(at[0], at[1]);
  ctx.rotate(tilt);
  ctx.beginPath();
  ctx.ellipse(0, 0, r, deep, 0, 0, Math.PI);
  ctx.ellipse(0, 0, r, rim, 0, Math.PI, 2 * Math.PI);
  ctx.closePath();
  inked(ctx, PAPER.wood, [-r, -rim], [r, deep]);
  ctx.beginPath();
  ctx.ellipse(0, 0, r - 6, rim - 3, 0, 0, 2 * Math.PI);
  inked(ctx, { lit: PAPER.wood.shade, shade: PAPER.wood.shade }, [-r, -rim], [r, rim]);
  ctx.restore();
};

/** A low table, its top's left and right ends `x0`, `x1` at height `top` (negative up), on one leg from `leg` to `leg + 22` down to the ground. */
export const table =
  (x0: number, x1: number, top: number, leg: number) => (ctx: CanvasRenderingContext2D) => {
    roundRect(ctx, leg, top + 16, 22, -top - 16, 2);
    inked(ctx, PAPER.wood, [leg, top + 16], [leg + 22, 0]);
    roundRect(ctx, x0, top, x1 - x0, 17, 3);
    inked(ctx, PAPER.wood, [x0, top], [x1, top + 17]);
  };

/** A low stool, its seat's left and right ends `x0`, `x1` at height `top` (negative up), on two legs. */
export const stool = (x0: number, x1: number, top: number) => (ctx: CanvasRenderingContext2D) => {
  for (const x of [x0 + 6, x1 - 22]) {
    roundRect(ctx, x, top + 12, 16, -top - 12, 2);
    inked(ctx, PAPER.wood, [x, top + 12], [x + 16, 0]);
  }
  roundRect(ctx, x0, top, x1 - x0, 16, 3);
  inked(ctx, PAPER.wood, [x0, top], [x1, top + 16]);
};
