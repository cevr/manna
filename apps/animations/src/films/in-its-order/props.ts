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
  // The sheet's orange teat, its lit side and its shaded right (poses-1, rows 326-346).
  teat: { lit: '#fab85e', shade: '#e5943b' },
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

/**
 * The teat's shape, units at size 1, its ink's half width in each: its
 * foot's half width on the collar, its neck's (its round tip's radius), and
 * how high its tip's middle stands over the collar, as the sheet draws it
 * (poses-1: its paper 32 px across at its foot, 10 at its tip, 24 tall, at
 * 1.37 px a unit).
 */
const TEAT = { foot: 13.5, neck: 5.5, rise: 14 } as const;

/** The baby's bottle, its body's bottom middle at `at`: a cream body, its collar, its orange teat on the collar; `size` 1 is 33 units across and 48 tall. */
export const bottle =
  (at: Pt, size = 1) =>
  (ctx: CanvasRenderingContext2D) => {
    const [x, y] = at;
    const [w, h] = [33 * size, 48 * size];
    roundRect(ctx, x - w / 2, y - h, w, h, 9 * size);
    inked(ctx, PAPER.milk, [x - w / 2, y - h], [x + w / 2, y]);
    const collar = y - h - 7 * size;
    roundRect(ctx, x - 0.36 * w, collar, 0.72 * w, 8 * size, 3 * size);
    inked(ctx, PAPER.milk, [x - 0.36 * w, collar], [x + 0.36 * w, y - h + size]);
    // The teat: its foot flared on the collar, its neck, its round tip.
    const [foot, neck] = [TEAT.foot * size, TEAT.neck * size];
    const rise = collar - TEAT.rise * size;
    ctx.beginPath();
    ctx.moveTo(x - foot, collar);
    ctx.quadraticCurveTo(x - neck, collar - 2 * size, x - neck, rise);
    ctx.arc(x, rise, neck, Math.PI, 2 * Math.PI);
    ctx.quadraticCurveTo(x + neck, collar - 2 * size, x + foot, collar);
    ctx.closePath();
    inked(ctx, PAPER.teat, [x - foot, rise - neck], [x + foot, collar]);
  };

/** The plate's half width and its depth below its rim, units. */
const PLATE = { r: 44, deep: 28, rim: 9 } as const;

/**
 * The wooden plate, a deep dish tipped into the mouth, its rim's middle at
 * `at`, tipped `tilt` radians (positive lowers its rim's screen-right end):
 * its round body under its rim, seen from outside, its far lip the top of its
 * outline.
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
