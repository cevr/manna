import {
  type Hand,
  type Pt,
  at,
  ellipseShape,
  length,
  quad,
  stroke,
  trim,
  sub,
  blob,
  glow,
  sky,
} from '@manna/film/canvas';
import { clamp, ease, lerp, staggered } from '@manna/film/core';
import { C, bubble, piece, type Hands } from './kit.ts';
import { tree } from './garden.ts';

export const wordLight = (ctx: CanvasRenderingContext2D, hand: Hand, size = 1, lit = 1) =>
  at(ctx, { x: 0, y: 0, scale: size }, () => {
    glow(ctx, 0, 0, 260, C.glow, 0.95 * lit);
    glow(ctx, 0, 0, 150, C.gold, 0.45 * lit);
    bubble(ctx, hand, (i) => sub(hand, 20 + i), { fill: C.gold, ink: C.cream, shadow: 0.2 });
  });

export const arc = (from: Pt, to: Pt, lift: number): Pt[] =>
  quad(from, [(from[0] + to[0]) / 2, Math.min(from[1], to[1]) - lift], to, 40);

export const flight = (
  ctx: CanvasRenderingContext2D,
  path: ReadonlyArray<Pt>,
  p: number,
  hand: Hand,
  size = 0.6,
  trail = true,
) => {
  if (p <= 0) return;
  const drawn = trim(path, length(path) * clamp(p));
  const head = drawn.at(-1) ?? path[0] ?? [0, 0];
  const prev = drawn.at(-4) ?? drawn[0] ?? head;
  const heading = Math.atan2(head[1] - prev[1], head[0] - prev[0]);
  if (!trail) {
    at(ctx, { x: head[0], y: head[1], rot: 0.35 * Math.sin(heading) }, () =>
      wordLight(ctx, hand, size),
    );
    return;
  }
  const tail = drawn.slice(Math.max(0, drawn.length - 22));
  stroke(
    ctx,
    tail,
    { color: C.glow, width: 34 * size, taper: 0.9, jitter: 0.6, alpha: 0.55 },
    sub(hand, 1),
  );
  stroke(
    ctx,
    tail,
    { color: C.gold, width: 12 * size, taper: 0.9, jitter: 0.4, alpha: 0.8 },
    sub(hand, 2),
  );
  at(ctx, { x: head[0], y: head[1], rot: 0.35 * Math.sin(heading) }, () =>
    wordLight(ctx, hand, size),
  );
};

export const SUN: Pt = [960, 300];
export const TREE: Pt = [1330, 905];

interface Dawn {
  readonly flood: number;
  readonly day: number;
  readonly sun: number;
  readonly land: number;
  readonly tree: number;
}

export const DAWN_DONE: Dawn = { flood: 1, day: 1, sun: 1, land: 1, tree: 1 };

const risen = (land: number, k: number) => ease.outBack(staggered(land, k, 0.4));

export const dawn = (ctx: CanvasRenderingContext2D, w: number, h: number, hand: Hands, d: Dawn) => {
  ctx.save();
  ctx.fillStyle = C.night;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  if (d.flood > 0) {
    ctx.save();
    ctx.globalAlpha *= d.flood;
    sky(ctx, w, h, [
      [0, C.dawnTop],
      [0.7, C.dawnLow],
      [1, C.peachLow],
    ]);
    ctx.restore();
  }
  if (d.day > 0) {
    ctx.save();
    ctx.globalAlpha *= d.day;
    sky(ctx, w, h, [
      [0, C.tealTop],
      [0.62, C.tealMid],
      [1, C.tealLow],
    ]);
    ctx.restore();
  }

  if (d.sun > 0) {
    const [sx, sy] = SUN;
    glow(ctx, sx, sy, 700 * d.sun, C.glow, 0.9);
    const ring = clamp(d.sun * 1.4);
    if (ring < 1)
      stroke(
        ctx,
        [...ellipseShape(sx, sy, 90 + 400 * ring, 90 + 400 * ring, 64)],
        { color: C.glow, width: 26 * (1 - ring), taper: 0, jitter: 0.8, alpha: 1 - ring },
        hand('burst'),
      );
    at(ctx, { x: sx, y: sy, scale: ease.outBack(clamp(d.sun)) }, () =>
      piece(ctx, ellipseShape(0, 0, 92, 92), C.gold, hand('sun'), {
        role: 'scenery',
        line: 0,
        shadow: 0.2,
      }),
    );
  }

  if (d.land > 0) {
    const far = (1 - risen(d.land, 0)) * 520;
    piece(
      ctx,
      [
        [-60, 760 + far],
        [260, 610 + far],
        [560, 690 + far],
        [880, 580 + far],
        [1240, 700 + far],
        [1580, 600 + far],
        [1980, 700 + far],
        [1980, 1120],
        [-60, 1120],
      ],
      C.boardShade,
      hand('hills'),
      { role: 'scenery', line: 0, torn: 4, shadow: 0.5 },
    );
    const sea = (1 - risen(d.land, 0.5)) * 460;
    piece(
      ctx,
      [
        [-60, 790 + sea],
        [900, 770 + sea],
        [900, 1120],
        [-60, 1120],
      ],
      C.water,
      hand('water'),
      { role: 'scenery', line: 0, torn: 3, shadow: 0.35 },
    );
    const near = (1 - risen(d.land, 1)) * 420;
    piece(
      ctx,
      [
        [640, 900 + near],
        [980, 820 + near],
        [1400, 850 + near],
        [1980, 800 + near],
        [1980, 1120],
        [640, 1120],
      ],
      C.board,
      hand('shore'),
      { role: 'scenery', line: 0, torn: 4, shadow: 0.6 },
    );
    piece(ctx, blob(260, 950 + near, 320, 110, 3), C.boardLight, hand('isle'), {
      role: 'scenery',
      line: 0,
      torn: 3,
      shadow: 0.5,
      alpha: clamp(d.land * 2 - 1),
    });
  }

  if (d.tree > 0)
    at(ctx, { x: TREE[0], y: TREE[1] }, () =>
      tree(ctx, hand('tree'), {
        height: 300,
        trunk: 34,
        lobes: 5,
        spread: 70,
        leaves: [C.leafShade, C.leaf],
        bark: C.boardDeep,
        seed: 9,
        grow: d.tree,
      }),
    );
};

export const toward = (a: Pt, b: Pt, t: number): Pt => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
