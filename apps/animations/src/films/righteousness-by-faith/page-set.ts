import { type Hex, clearOf, mix, ramp, rounded, unprobed } from '@manna/film/canvas';
import { clamp } from '@manna/film/core';
import { type Pt, keyLight, shading } from '@manna/film/style';
import { contact, cut } from './court-set.ts';
import { C } from './kit.ts';

export interface Paper {
  readonly color: Hex;
  readonly shade: Hex;
}

export const paper = (base: Hex, share: number): Paper => {
  const r = ramp(base, keyLight, shading);
  return { color: r.base, shade: mix(r.base, r.shade, share) };
};

const trace = (ctx: CanvasRenderingContext2D, pts: ReadonlyArray<Pt>) => {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
};

export const PAGE: Hex = mix(C.cream, C.peachTop, 0.3);

interface Shaft {
  readonly angle: number;
  readonly half: number;
}

interface Shafts {
  readonly from: Pt;
  readonly reach: number;
  readonly color: Hex;
  readonly alpha: number;
  readonly each: ReadonlyArray<Shaft>;
}

const SHAFTS: Shafts = {
  from: [-0.08, -0.12],
  reach: 1.1,
  color: '#fff7de',
  alpha: 0.5,
  each: [
    { angle: 0.58, half: 0.03 },
    { angle: 0.74, half: 0.05 },
    { angle: 0.9, half: 0.028 },
    { angle: 1.05, half: 0.042 },
  ],
};

interface Layer {
  readonly wide: number;
  readonly share: number;
}
const SOFT: ReadonlyArray<Layer> = [
  { wide: 1.6, share: 0.25 },
  { wide: 1, share: 0.35 },
  { wide: 0.5, share: 0.4 },
];

export const shafts = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  const ox = SHAFTS.from[0] * w;
  const oy = SHAFTS.from[1] * h;
  const r = SHAFTS.reach * w;
  ctx.save();
  const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, r);
  g.addColorStop(0, SHAFTS.color);
  g.addColorStop(1, clearOf(SHAFTS.color));
  ctx.fillStyle = g;
  for (const s of SHAFTS.each)
    for (const { wide, share } of SOFT) {
      const a0 = s.angle - s.half * wide;
      const a1 = s.angle + s.half * wide;
      ctx.save();
      ctx.globalAlpha *= SHAFTS.alpha * share;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + r * Math.cos(a0), oy + r * Math.sin(a0));
      ctx.lineTo(ox + r * Math.cos(a1), oy + r * Math.sin(a1));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  ctx.restore();
};

const SHADOW: Hex = '#b7a3dc';

interface Throw {
  readonly x: number;
  readonly y: number;
}
const THROW: Throw = { x: 0.7, y: 0.17 };

export const cast = (
  ctx: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  y: number,
  h: number,
  alpha: number,
) => {
  if (alpha <= 0) return;
  const dx = THROW.x * h;
  const dy = THROW.y * h;
  ctx.save();
  ctx.globalAlpha *= alpha;
  const g = ctx.createLinearGradient(x0, y, x0 + dx, y + dy);
  g.addColorStop(0, SHADOW);
  g.addColorStop(1, clearOf(SHADOW));
  ctx.fillStyle = g;
  trace(ctx, [
    [x0, y],
    [x1, y],
    [x1 + dx, y + dy],
    [x0 + dx, y + dy],
  ]);
  ctx.fill();
  ctx.restore();
};

export const GOLD_GLOW: Hex = '#ffd35c';

const GLOW_LAYERS: ReadonlyArray<Layer> = [
  { wide: 3.4, share: 0.06 },
  { wide: 2.4, share: 0.08 },
  { wide: 1.7, share: 0.1 },
];

const along = (ctx: CanvasRenderingContext2D, pts: ReadonlyArray<Pt>) => {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
};

const halo = (
  ctx: CanvasRenderingContext2D,
  pts: ReadonlyArray<Pt>,
  width: number,
  amount: number,
) => {
  if (amount <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = GOLD_GLOW;
  along(ctx, pts);
  for (const { wide, share } of GLOW_LAYERS) {
    ctx.save();
    ctx.globalAlpha *= Math.min(1, share * amount);
    ctx.lineWidth = width * wide;
    unprobed(ctx, () => ctx.stroke());
    ctx.restore();
  }
  ctx.restore();
};

export const goldLine = (
  ctx: CanvasRenderingContext2D,
  pts: ReadonlyArray<Pt>,
  width: number,
  alpha: number,
) => {
  if (pts.length < 2 || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  halo(ctx, pts, width, 1);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = width;
  along(ctx, pts);
  unprobed(ctx, () => ctx.stroke());
  ctx.restore();
};

interface Lines {
  readonly first: number;
  readonly last: number;
  readonly length: number;
  readonly thick: number;
}

interface TabletMeasure {
  readonly w: number;
  readonly h: number;
  readonly gap: number;
  readonly lines: Lines;
}

export const TABLET: TabletMeasure = {
  w: 162,
  h: 282,
  gap: 8,
  lines: { first: 0.254, last: 0.821, length: 0.52, thick: 8 },
};

const LINES_EACH = 5;

const STONE = paper('#ad9584', 0.6);

interface LitLine {
  readonly face: Hex;
  readonly rest: number;
  readonly swell: number;
}
const LIT: LitLine = { face: '#ffe27a', rest: 1.3, swell: 1.2 };

const ARCH = 18;

const tabletShape = (x0: number, y0: number, scale: number): Pt[] => {
  const w = TABLET.w * scale;
  const r = w / 2;
  const top = y0 - (TABLET.h * scale - r);
  const pts: Pt[] = [
    [x0, y0],
    [x0, top],
  ];
  for (let i = 1; i < ARCH; i++) {
    const a = Math.PI + (i / ARCH) * Math.PI;
    pts.push([x0 + r + r * Math.cos(a), top + r * Math.sin(a)]);
  }
  pts.push([x0 + w, top], [x0 + w, y0]);
  return pts;
};

export const tabletEdgeAt = (x0: number, y0: number, scale: number, u: number): Pt => {
  const w = TABLET.w * scale;
  const r = w / 2;
  const side = TABLET.h * scale - r;
  const arc = Math.PI * r;
  let d = clamp(u) * (w + 2 * side + arc);
  if (d <= r) return [x0 + r - d, y0];
  d -= r;
  if (d <= side) return [x0, y0 - d];
  d -= side;
  if (d <= arc) {
    const a = Math.PI - (d / arc) * Math.PI;
    return [x0 + r + r * Math.cos(a), y0 - side - r * Math.sin(a)];
  }
  d -= arc;
  if (d <= side) return [x0 + w, y0 - side + d];
  d -= side;
  return [x0 + w - d, y0];
};

export interface TabletsPose {
  x: number;
  y: number;
  scale: number;
  stone: number;
  readonly lit: number[];
  swell: number;
}

export const tabletsAt = (x: number, y: number): TabletsPose => ({
  x,
  y,
  scale: 1,
  stone: 0,
  lit: Array.from({ length: 2 * LINES_EACH }, () => 0),
  swell: 0,
});

export const tabletX = (p: TabletsPose, i: number) => p.x + i * (TABLET.w + TABLET.gap) * p.scale;

export const tablets = (ctx: CanvasRenderingContext2D, p: TabletsPose) => {
  if (p.stone <= 0) return;
  for (let i = 0; i < 2; i++) {
    const x0 = tabletX(p, i);
    cut(ctx, tabletShape(x0, p.y, p.scale), STONE, { alpha: p.stone });
    tabletLines(ctx, x0, p, i * LINES_EACH);
  }
};

export const standingTablets = (ctx: CanvasRenderingContext2D, p: TabletsPose) => {
  const s = p.scale;
  cast(ctx, p.x, p.x + (2 * TABLET.w + TABLET.gap) * s, p.y, TABLET.h * s, 0.6 * p.stone);
  ctx.save();
  ctx.globalAlpha *= p.stone;
  for (let i = 0; i < 2; i++)
    contact(ctx, tabletX(p, i) + (TABLET.w * s) / 2, p.y + 2, 0.62 * TABLET.w * s);
  ctx.restore();
  tablets(ctx, p);
};

const tabletLines = (ctx: CanvasRenderingContext2D, x0: number, p: TabletsPose, from: number) => {
  const { lines } = TABLET;
  const w = TABLET.w * p.scale;
  const h = TABLET.h * p.scale;
  const cx = x0 + w / 2;
  const len = lines.length * w;
  const thick = lines.thick * p.scale;
  for (let k = 0; k < LINES_EACH; k++) {
    const cy = p.y - h + h * (lines.first + ((lines.last - lines.first) * k) / (LINES_EACH - 1));
    const bar = rounded(cx, cy, len, thick, thick / 2);
    ctx.save();
    ctx.globalAlpha *= p.stone;
    ctx.fillStyle = STONE.shade;
    trace(ctx, bar);
    ctx.fill();
    ctx.restore();
    const lit = p.lit[from + k] ?? 0;
    if (lit <= 0) continue;
    ctx.save();
    ctx.globalAlpha *= p.stone * Math.min(1, lit);
    ctx.fillStyle = LIT.face;
    trace(ctx, bar);
    ctx.fill();
    ctx.restore();
    const reach = len / 2 - thick / 2;
    halo(
      ctx,
      [
        [cx - reach, cy],
        [cx + reach, cy],
      ],
      thick,
      p.stone * lit * (LIT.rest + LIT.swell * p.swell),
    );
  }
};

interface Lobe {
  readonly at: number;
  readonly reach: number;
  readonly width: number;
}

const LOBES: ReadonlyArray<Lobe> = [
  { at: 0, reach: 1, width: 0.56 },
  { at: -1.12, reach: 0.9, width: 0.5 },
  { at: 1.12, reach: 0.9, width: 0.5 },
  { at: -2.15, reach: 0.64, width: 0.42 },
  { at: 2.15, reach: 0.64, width: 0.42 },
];

const LEAF_R = 35;
const SINUS = 0.4;
interface Stalk {
  readonly length: number;
  readonly width: number;
}
const STALK: Stalk = { length: 16, width: 4 };

const LEAF_SHAPE: ReadonlyArray<Pt> = Array.from({ length: 84 }, (_, i): Pt => {
  const a = -Math.PI + (2 * Math.PI * i) / 84;
  let lobe = 0;
  for (const l of LOBES) lobe = Math.max(lobe, l.reach * Math.exp(-(((a - l.at) / l.width) ** 2)));
  const reach = LEAF_R * (SINUS + (1 - SINUS) * lobe);
  return [reach * Math.sin(a), -reach * Math.cos(a)];
});

const VEINS: ReadonlyArray<Pt> = LOBES.map((l): Pt => [
  0.72 * LEAF_R * l.reach * Math.sin(l.at),
  -0.72 * LEAF_R * l.reach * Math.cos(l.at),
]);

const LEAF = paper('#6f8f40', 0.6);
const DRY = paper('#cca358', 0.6);
interface Edges {
  readonly green: Hex;
  readonly dry: Hex;
}
const EDGE: Edges = { green: '#46632a', dry: '#8f6f36' };

export interface LeafPose {
  readonly x: number;
  readonly y: number;
  readonly rot: number;
  readonly scale: number;
  readonly curl: number;
  readonly lie: number;
}

const placed = (p: LeafPose, curl: number) => {
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  const across = p.scale * (1 - 0.5 * curl);
  return ([x, y]: Pt): Pt => {
    const u = x * across;
    const v = y * p.scale;
    return [p.x + u * c - v * s, p.y + (u * s + v * c) * p.lie];
  };
};

export const leaf = (ctx: CanvasRenderingContext2D, p: LeafPose) => {
  const curl = clamp(p.curl);
  const paperNow: Paper =
    curl > 0
      ? { color: mix(LEAF.color, DRY.color, curl), shade: mix(LEAF.shade, DRY.shade, curl) }
      : LEAF;
  const on = placed(p, curl);
  const blade = LEAF_SHAPE.map(on);
  ctx.save();
  ctx.fillStyle = paperNow.shade;
  trace(ctx, rounded(0, STALK.length / 2, STALK.width, STALK.length, STALK.width / 2).map(on));
  ctx.fill();
  cut(ctx, blade, paperNow, { line: 0 });
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = paperNow.shade;
  ctx.lineWidth = 2.4 * p.scale;
  ctx.beginPath();
  const [hx, hy] = on([0, 0]);
  for (const vein of VEINS) {
    ctx.moveTo(hx, hy);
    ctx.lineTo(...on(vein));
  }
  unprobed(ctx, () => ctx.stroke());
  ctx.strokeStyle = mix(EDGE.green, EDGE.dry, curl);
  ctx.lineWidth = 2 * p.scale;
  trace(ctx, blade);
  unprobed(ctx, () => ctx.stroke());
  ctx.restore();
};
