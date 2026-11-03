import { mix, spline, unprobed } from '@manna/film/canvas';
import { clamp, lerp } from '@manna/film/core';
import type { Pt } from '@manna/film/style';
import { cut } from './court-set.ts';
import { C } from './kit.ts';
import { GOLD_GLOW, type Paper, paper } from './page-set.ts';

export const SEAL_GOLD = {
  wax: C.gold,
  shade: '#cf8a2e',
  rim: '#b9781f',
  ribbon: '#d49a32',
  letter: '#8a5a12',
} as const;

const P = {
  seed: { color: '#ebb43e', shade: '#c98a26' },
  blade: { color: '#a1be41', shade: '#7baa28' },
  leaf: { color: '#cca358', shade: '#ba964d' },
} as const;

const drop = (rx: number, ry: number): Pt[] =>
  Array.from({ length: 20 }, (_, i): Pt => {
    const t = (i / 20) * 2 * Math.PI;
    const w = 0.45 + 0.55 * ((1 - Math.cos(t)) / 2);
    return [rx * Math.sin(t) * w, -ry * Math.cos(t)];
  });

export interface SeedPose {
  x: number;
  y: number;
  rot: number;
  scale: number;
  shown: number;
}

export const noSeed = (): SeedPose => ({ x: 0, y: 0, rot: 0, scale: 1, shown: 0 });

export const seed = (ctx: CanvasRenderingContext2D, s: SeedPose) => {
  if (s.shown <= 0) return;
  ctx.save();
  ctx.globalAlpha *= Math.min(1, s.shown);
  ctx.translate(s.x, s.y);
  ctx.rotate(s.rot);
  ctx.scale(s.scale, s.scale);
  cut(ctx, drop(9.5, 10), P.seed, { line: 2.4 });
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath();
  ctx.ellipse(-3.2, -2, 2, 3, -0.3, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();
};

const bladeLeaf = (tip: Pt, w: number, bow: number): Pt[] => {
  const n = 8;
  const len = Math.hypot(tip[0], tip[1]);
  const nx = -tip[1] / len;
  const ny = tip[0] / len;
  const side = (sign: number) =>
    Array.from({ length: n + 1 }, (_, i): Pt => {
      const t = i / n;
      const b = bow * Math.sin(Math.PI * t);
      const half = (sign * w * Math.sin(Math.PI * t) ** 0.8) / 2;
      return [tip[0] * t + nx * (b + half), tip[1] * t + ny * (b + half)];
    });
  return [...side(1), ...side(-1).reverse().slice(1, -1)];
};

const BLADE: ReadonlyArray<{ readonly tip: Pt; readonly w: number; readonly bow: number }> = [
  { tip: [-13, -24], w: 6, bow: -3 },
  { tip: [12, -22], w: 6, bow: 3 },
  { tip: [-2, -36], w: 7, bow: 2 },
];

export const blade = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  grow: number,
  sway = 0,
) => {
  if (grow <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(sway);
  ctx.scale(Math.min(1, 0.4 + grow), grow);
  for (const leaf of BLADE) cut(ctx, bladeLeaf(leaf.tip, leaf.w, leaf.bow), P.blade, { line: 2 });
  ctx.restore();
};

export const figLeaf = (ctx: CanvasRenderingContext2D, x: number, y: number, rot: number) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(1, 0.55);
  const pts = Array.from({ length: 16 }, (_, i): Pt => {
    const t = (i / 16) * 2 * Math.PI;
    return [20 * Math.cos(t), 11 * Math.sin(t) * Math.abs(Math.sin(t)) ** 0.3];
  });
  cut(ctx, pts, P.leaf, { line: 2.4 });
  cut(
    ctx,
    [
      [-16, 0],
      [16, 0],
    ],
    P.leaf,
    { line: 1.6, flat: true },
  );
  ctx.restore();
};

export const glow = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  amount: number,
) => {
  if (amount <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha *= Math.min(1, amount);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, `${color.slice(0, 7)}00`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();
};

const SEED_TALL = 100;

const HUSK = { half: 43, notch: 10, cleft: 0.26 } as const;

const HOLLOW = { x: 1.5, y: 2, half: 16.5, tall: 43, face: 4 } as const;

const LINES = { lip: 0.7, hollow: 0.45 } as const;

const HEART = { x: 3, y: 8, r: 30, share: 0.9 } as const;

const HALO = { r: 64, share: 0.5 } as const;

interface FoldedLeaf {
  readonly foot: Pt;
  readonly tip: Pt;
  readonly w: number;
  readonly bow: number;
}

interface Folded {
  readonly back: FoldedLeaf;
  readonly front: FoldedLeaf;
  readonly root: { readonly spine: ReadonlyArray<Pt>; readonly w: number; readonly tip: number };
  readonly base: Pt;
}

const EMBRYO: Folded = {
  back: { foot: [-6, 10], tip: [0, -32], w: 21, bow: 0 },
  front: { foot: [-8, 18], tip: [10, -23], w: 26, bow: 2.5 },
  root: {
    spine: [
      [5, 4],
      [10, 14],
      [5, 24],
      [-3, 30],
      [-2, 37],
      [4, 40],
    ],
    w: 11,
    tip: 0.55,
  },
  base: [0, 8],
};

const CURLED = 0.8;

const SCRAP: ReadonlyArray<Pt> = [
  [-10, 45],
  [-13, 61],
  [-7, 57],
  [-2.5, 62.5],
  [3.5, 46],
];

const OPEN = {
  husk: paper('#c8994f', 0.6),
  gold: paper(SEAL_GOLD.wax, 0.6),
  face: paper('#d8ad69', 0.5),
  faceLit: paper('#f2c862', 0.5),
  hollow: paper('#e3c594', 0.5),
  lit: paper('#f4cf6a', 0.4),
  leaf: paper('#86a85a', 0.6),
  leafBack: paper('#6b8f45', 0.6),
  root: paper('#f3ead8', 0.5),
  ribbon: paper(SEAL_GOLD.ribbon, 0.6),
  heart: GOLD_GLOW,
} as const;

const ROUND = 48;

const toward = (a: Paper, b: Paper, k: number): Paper =>
  k <= 0 ? a : { color: mix(a.color, b.color, k), shade: mix(a.shade, b.shade, k) };

const huskShape = (open: number): Pt[] => {
  const pts: Pt[] = [];
  for (let i = 0; i < ROUND; i++) {
    const t = (i / ROUND) * 2 * Math.PI;
    const full = 0.62 + 0.19 * (1 - Math.cos(t));
    const fromTip = Math.min(t, 2 * Math.PI - t);
    pts.push([
      HUSK.half * Math.sin(t) * full,
      -(SEED_TALL / 2) * Math.cos(t) + HUSK.notch * open * Math.exp(-((fromTip / HUSK.cleft) ** 2)),
    ]);
  }
  return pts;
};

const lens = (x: number, y: number, half: number, tall: number): Pt[] => {
  const side = ROUND / 2;
  const at = (i: number, sign: number): Pt => {
    const s = -Math.cos((i / side) * Math.PI);
    return [x + sign * half * (1 - s * s) ** 0.85 * (1 + 0.15 * s), y + tall * s];
  };
  const pts: Pt[] = [];
  for (let i = 0; i <= side; i++) pts.push(at(i, 1));
  for (let i = side - 1; i > 0; i--) pts.push(at(i, -1));
  return pts;
};

const TIP_POINTS = 5;

const tube = (spine: ReadonlyArray<Pt>, w: number, tip: number): Pt[] => {
  const n = spine.length;
  const near: Pt[] = [];
  const far: Pt[] = [];
  let heading = 0;
  for (let i = 0; i < n; i++) {
    const [x, y] = spine[i] ?? [0, 0];
    const [ax, ay] = spine[Math.max(0, i - 1)] ?? [x, y];
    const [bx, by] = spine[Math.min(n - 1, i + 1)] ?? [x, y];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const half = (w / 2) * lerp(1, tip, i / (n - 1));
    const nx = (-(by - ay) / len) * half;
    const ny = ((bx - ax) / len) * half;
    near.push([x + nx, y + ny]);
    far.push([x - nx, y - ny]);
    heading = Math.atan2(by - ay, bx - ax);
  }
  const [ex, ey] = spine[n - 1] ?? [0, 0];
  const r = (w / 2) * tip;
  const round = Array.from({ length: TIP_POINTS }, (_, j): Pt => {
    const a = heading + Math.PI / 2 - ((j + 1) / (TIP_POINTS + 1)) * Math.PI;
    return [ex + r * Math.cos(a), ey + r * Math.sin(a)];
  });
  return [...near, ...round, ...far.reverse()];
};

const trace = (ctx: CanvasRenderingContext2D, pts: ReadonlyArray<Pt>) => {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
};

const foldedLeaf = (ctx: CanvasRenderingContext2D, l: FoldedLeaf, p: Paper, line: number) => {
  ctx.save();
  ctx.translate(l.foot[0], l.foot[1]);
  cut(ctx, bladeLeaf([l.tip[0] - l.foot[0], l.tip[1] - l.foot[1]], l.w, l.bow), p, { line });
  ctx.restore();
};

const embryo = (ctx: CanvasRenderingContext2D, grown: number, line: number) => {
  const g = lerp(CURLED, 1, clamp(grown));
  const [bx, by] = EMBRYO.base;
  ctx.save();
  ctx.translate(bx, by);
  ctx.scale(g, g);
  ctx.translate(-bx, -by);
  const ink = line / g;
  foldedLeaf(ctx, EMBRYO.back, OPEN.leafBack, ink);
  const { spine, w, tip } = EMBRYO.root;
  cut(ctx, tube(spline(spine, 6), w, tip), OPEN.root, { line: ink });
  foldedLeaf(ctx, EMBRYO.front, OPEN.leaf, ink);
  ctx.restore();
};

const seam = (ctx: CanvasRenderingContext2D, line: number, open: number) => {
  if (open >= 1) return;
  ctx.save();
  ctx.globalAlpha *= 1 - open;
  ctx.lineCap = 'round';
  ctx.lineWidth = line;
  ctx.strokeStyle = C.outline;
  ctx.beginPath();
  ctx.moveTo(0, 3 - SEED_TALL / 2 + HUSK.notch * open);
  ctx.quadraticCurveTo(4, 0, 0, SEED_TALL / 2 - 4);
  unprobed(ctx, () => ctx.stroke());
  ctx.restore();
};

export interface OpenSeedPose {
  x: number;
  y: number;
  rot: number;
  size: number;
  open: number;
  grown: number;
  glow: number;
  line: number;
  shown: number;
}

const inked = (ctx: CanvasRenderingContext2D, pts: ReadonlyArray<Pt>, line: number) => {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = line;
  ctx.strokeStyle = C.outline;
  trace(ctx, pts);
  unprobed(ctx, () => ctx.stroke());
  ctx.restore();
};

export const openSeed = (ctx: CanvasRenderingContext2D, s: OpenSeedPose) => {
  if (s.shown <= 0 || s.size <= 0) return;
  const k = s.size / SEED_TALL;
  const ink = s.line / k;
  const inner = LINES.lip * ink;
  const lit = clamp(s.glow);
  const open = clamp(s.open);
  const husk = huskShape(open);
  ctx.save();
  ctx.globalAlpha *= Math.min(1, s.shown);
  ctx.translate(s.x, s.y);
  ctx.rotate(s.rot);
  ctx.scale(k, k);
  glow(ctx, HEART.x, HEART.y, HALO.r, GOLD_GLOW, HALO.share * s.glow);
  cut(ctx, SCRAP, OPEN.ribbon, { line: 0.8 * ink, flat: true });
  cut(ctx, husk, toward(OPEN.husk, OPEN.gold, lit), { line: ink });
  seam(ctx, 0.6 * ink, open);
  if (open > 0) {
    const { x, y, half, tall, face } = HOLLOW;
    const hollow = lens(x, y, half * open, tall);
    ctx.save();
    trace(ctx, husk);
    ctx.clip();
    cut(ctx, lens(x, y, (half + face) * open, tall + face), toward(OPEN.face, OPEN.faceLit, lit), {
      line: inner,
      flat: true,
    });
    cut(ctx, hollow, toward(OPEN.hollow, OPEN.lit, lit), { line: 0, flat: true });
    ctx.save();
    trace(ctx, hollow);
    ctx.clip();
    glow(ctx, HEART.x, HEART.y, HEART.r, OPEN.heart, HEART.share * s.glow);
    embryo(ctx, s.grown, inner);
    ctx.restore();
    inked(ctx, hollow, LINES.hollow * ink);
    ctx.restore();
    inked(ctx, husk, ink);
  }
  ctx.restore();
};
