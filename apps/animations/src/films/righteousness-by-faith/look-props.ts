import {
  type Hand,
  type Hex,
  type Pt,
  cutout,
  ellipseShape,
  length,
  mix,
  probeFace,
  ramp,
  rounded,
  spline,
  sub,
  trim,
  unprobed,
  wash,
} from '@manna/film/canvas';
import { clamp, lerp } from '@manna/film/core';
import { type Crease, boxOf, creaseOf, keyLight, shading } from '@manna/film/style';
import { contact, cut } from './court-set.ts';
import { C } from './kit.ts';
import { GOLD_GLOW, type Paper, cast, paper } from './page-set.ts';
import { glow as shine } from './props.ts';
import { type Torn, plane } from './spoke-props.ts';

export const SMALL_LINE = 2.4;

const ROOT_SPINE: ReadonlyArray<Pt> = spline(
  [
    [0, 0],
    [-4, 4.5],
    [-6.5, 10.5],
    [-5.5, 16.5],
    [-2, 20],
    [2.5, 19.5],
  ],
  6,
);
const ROOT_LENGTH = length(ROOT_SPINE);

const ROOT = { w: 7, tip: 0.6, paper: paper('#f3ead8', 0.5) } as const;

const TIP_POINTS = 5;

const tube = (spine: ReadonlyArray<Pt>, width: (i: number) => number): Pt[] => {
  const n = spine.length;
  const near: Pt[] = [];
  const far: Pt[] = [];
  let heading = 0;
  for (let i = 0; i < n; i++) {
    const [x, y] = spine[i] ?? [0, 0];
    const [ax, ay] = spine[Math.max(0, i - 1)] ?? [x, y];
    const [bx, by] = spine[Math.min(n - 1, i + 1)] ?? [x, y];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const half = width(i) / 2;
    const nx = (-(by - ay) / len) * half;
    const ny = ((bx - ax) / len) * half;
    near.push([x + nx, y + ny]);
    far.push([x - nx, y - ny]);
    heading = Math.atan2(by - ay, bx - ax);
  }
  const [ex, ey] = spine[n - 1] ?? [0, 0];
  const r = width(n - 1) / 2;
  const round = Array.from({ length: TIP_POINTS }, (_, j): Pt => {
    const a = heading + Math.PI / 2 - ((j + 1) / (TIP_POINTS + 1)) * Math.PI;
    return [ex + r * Math.cos(a), ey + r * Math.sin(a)];
  });
  return [...near, ...round, ...far.reverse()];
};

const tapered =
  (w: number, tip: number, n: number) =>
  (i: number): number =>
    w * lerp(1, tip, i / Math.max(1, n - 1));

const trace = (ctx: CanvasRenderingContext2D, pts: ReadonlyArray<Pt>) => {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
};

const inked = (ctx: CanvasRenderingContext2D, pts: ReadonlyArray<Pt>, line: number) => {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = line;
  ctx.strokeStyle = C.outline;
  trace(ctx, pts);
  unprobed(ctx, () => ctx.stroke());
  ctx.restore();
};

export const firstRoot = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  grow: number,
  line: number,
) => {
  const k = clamp(grow);
  if (k <= 0) return;
  const spine = trim(ROOT_SPINE, ROOT_LENGTH * k);
  if (spine.length < 2) return;
  ctx.save();
  ctx.translate(x, y);
  cut(ctx, tube(spine, tapered(ROOT.w * lerp(0.6, 1, k), ROOT.tip, spine.length)), ROOT.paper, {
    line,
  });
  ctx.restore();
};

const MERIT_PAPER = {
  card: paper('#f3e9d5', 0.5),
  cardFar: paper('#e8d9bb', 0.5),
  medal: paper('#a9a0be', 0.6),
  ribbon: paper('#6fa4a6', 0.6),
  coin: paper('#bba37a', 0.6),
} as const;

interface Merit {
  readonly at: Pt;
  readonly rot: number;
  readonly draw: (ctx: CanvasRenderingContext2D, line: number) => void;
}

const certificate =
  (w: number, h: number, p: typeof MERIT_PAPER.card, rosette: boolean) =>
  (ctx: CanvasRenderingContext2D, line: number) => {
    cut(ctx, rounded(0, 0, w, h, 2), p, { line });
    if (!rosette) return;
    const x = w / 2 - 9;
    const y = h / 2 - 9;
    cut(
      ctx,
      [
        [x - 3, y + 1],
        [x - 5, y + 10],
        [x - 1, y + 8],
        [x + 1, y + 11],
        [x + 2.5, y + 1],
      ],
      MERIT_PAPER.ribbon,
      { line: 0.8 * line, flat: true },
    );
    cut(ctx, ellipseShape(x, y, 5, 5, 24), MERIT_PAPER.ribbon, { line: 0.8 * line });
  };

const medal = (ctx: CanvasRenderingContext2D, line: number) => {
  cut(
    ctx,
    [
      [-6, -20],
      [6, -20],
      [3.5, -4],
      [-3.5, -4],
    ],
    MERIT_PAPER.ribbon,
    { line: 0.8 * line },
  );
  cut(ctx, ellipseShape(0, 0, 8.5, 8.5, 32), MERIT_PAPER.medal, { line });
};

const coin = (ctx: CanvasRenderingContext2D, line: number) =>
  cut(ctx, ellipseShape(0, 0, 8, 8, 28), MERIT_PAPER.coin, { line });

const HAND_TOP = 20.5;

const MERITS: ReadonlyArray<Merit> = [
  { at: [8, -HAND_TOP - 17], rot: 0.14, draw: certificate(44, 32, MERIT_PAPER.cardFar, false) },
  { at: [-4, -HAND_TOP - 16], rot: -0.08, draw: certificate(46, 33, MERIT_PAPER.card, true) },
  { at: [25, -HAND_TOP - 7], rot: 0.12, draw: medal },
  { at: [-18, -HAND_TOP - 7], rot: 0, draw: coin },
  { at: [-6, -HAND_TOP - 6], rot: 0, draw: coin },
  { at: [-13, -HAND_TOP - 20], rot: 0, draw: coin },
];

export const MERIT_COUNT = MERITS.length;

const STACK = 1.2;

const FALL = { x: -95, y: 260, rot: -1.4 } as const;

export const merits = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  gone: (i: number) => number,
  line: number,
) => {
  ctx.save();
  ctx.translate(x, y - HAND_TOP);
  ctx.scale(STACK, STACK);
  ctx.translate(0, HAND_TOP);
  MERITS.forEach((m, j) => {
    const k = gone(MERITS.length - 1 - j);
    if (k >= 1) return;
    ctx.save();
    ctx.translate(m.at[0] + (FALL.x * k) / STACK, m.at[1] + (FALL.y * k) / STACK);
    ctx.rotate(m.rot + FALL.rot * k);
    m.draw(ctx, line / STACK);
    ctx.restore();
  });
  ctx.restore();
};

const CAMP = { left: -900, right: 2500, top: -900, bottom: 1900 } as const;

const below = (top: ReadonlyArray<Pt>): Pt[] => {
  const edge = spline(top, 8);
  const first = edge[0] ?? [0, 0];
  const last = edge.at(-1) ?? first;
  return [
    [CAMP.left, first[1]],
    ...edge,
    [CAMP.right, last[1]],
    [CAMP.right, CAMP.bottom],
    [CAMP.left, CAMP.bottom],
  ];
};

const SKY: ReadonlyArray<readonly [number, Hex]> = [
  [-300, '#e2a49c'],
  [40, '#ecb8a8'],
  [170, '#f3cdb3'],
  [300, '#f7dfc0'],
];
const SKY_WASH = SKY.map(([y, c]): readonly [number, Hex] => [
  (y - CAMP.top) / (CAMP.bottom - CAMP.top),
  c,
]);

export const campSky = (ctx: CanvasRenderingContext2D) =>
  wash(ctx, CAMP.left, CAMP.top, CAMP.right - CAMP.left, CAMP.bottom - CAMP.top, SKY_WASH);

const DUNES: ReadonlyArray<readonly [ReadonlyArray<Pt>, Torn]> = [
  [
    below([
      [-900, 206],
      [-300, 214],
      [0, 212],
      [170, 190],
      [360, 198],
      [560, 226],
      [760, 246],
      [900, 230],
      [1010, 196],
      [1120, 152],
      [1250, 138],
      [1390, 152],
      [1536, 180],
      [1800, 200],
      [2500, 212],
    ]),
    { color: '#e4c6bf', rim: '#f3e0d6' },
  ],
  [
    below([
      [-900, 262],
      [-200, 266],
      [0, 262],
      [250, 245],
      [480, 256],
      [700, 280],
      [900, 266],
      [1080, 244],
      [1290, 256],
      [1536, 238],
      [1800, 246],
      [2500, 256],
    ]),
    { color: '#dcb9ad', rim: '#efd5c8' },
  ],
  [
    below([
      [-900, 302],
      [0, 298],
      [400, 304],
      [800, 300],
      [1200, 296],
      [1536, 300],
      [2500, 302],
    ]),
    { color: '#ecd6b8', rim: '#f7e8d0' },
  ],
];

export const dunes = (ctx: CanvasRenderingContext2D, hand: Hand) =>
  DUNES.forEach(([pts, p], i) => plane(ctx, pts, p, sub(hand, i)));

const SAND = {
  far: [
    below([
      [-900, 336],
      [0, 334],
      [300, 338],
      [700, 342],
      [1100, 332],
      [1536, 330],
      [2500, 334],
    ]),
    { color: '#ead1b0', rim: '#f6e4c8' },
  ],
  near: [
    below([
      [-900, 444],
      [0, 450],
      [350, 470],
      [700, 478],
      [1000, 462],
      [1300, 488],
      [1536, 470],
      [2500, 470],
    ]),
    { color: '#e7cba6', rim: '#f4e0c2' },
  ],
  ground: [
    below([
      [-900, 528],
      [0, 522],
      [400, 518],
      [800, 526],
      [1200, 520],
      [1536, 524],
      [2500, 526],
    ]),
    { color: '#e5c69f', rim: '#f2dcbc' },
  ],
} as const satisfies Record<string, readonly [ReadonlyArray<Pt>, Torn]>;

export const sand = (ctx: CanvasRenderingContext2D, band: keyof typeof SAND, hand: Hand) => {
  const [pts, p] = SAND[band];
  plane(ctx, pts, p, hand);
};

interface Tent {
  readonly x: number;
  readonly foot: number;
  readonly tall: number;
  readonly half: number;
  readonly cloth: Paper;
  readonly door?: boolean;
}

const CLOTH = { pale: paper('#e3dacf', 0.7), sage: paper('#adb594', 0.7) } as const;
const TENT_POLE: Hex = '#8b6b4f';
const DOOR: Hex = '#5c4a63';

const FAR_TENTS: ReadonlyArray<Tent> = [
  { x: -150, foot: 346, tall: 54, half: 32, cloth: CLOTH.pale },
  { x: 110, foot: 346, tall: 50, half: 30, cloth: CLOTH.sage },
  { x: 255, foot: 344, tall: 60, half: 36, cloth: CLOTH.pale },
  { x: 455, foot: 350, tall: 46, half: 28, cloth: CLOTH.pale },
  { x: 545, foot: 354, tall: 56, half: 33, cloth: CLOTH.sage },
  { x: 905, foot: 350, tall: 50, half: 30, cloth: CLOTH.pale },
  { x: 1010, foot: 344, tall: 62, half: 37, cloth: CLOTH.sage },
  { x: 1115, foot: 342, tall: 48, half: 29, cloth: CLOTH.pale },
  { x: 1265, foot: 342, tall: 58, half: 34, cloth: CLOTH.sage },
  { x: 1395, foot: 342, tall: 52, half: 31, cloth: CLOTH.pale },
  { x: 1680, foot: 344, tall: 56, half: 33, cloth: CLOTH.sage },
];

const NEAR_TENTS: ReadonlyArray<Tent> = [
  { x: 1440, foot: 452, tall: 104, half: 56, cloth: CLOTH.sage },
  { x: 45, foot: 456, tall: 262, half: 126, cloth: CLOTH.pale, door: true },
  { x: -300, foot: 474, tall: 180, half: 90, cloth: CLOTH.sage },
  { x: 1100, foot: 474, tall: 150, half: 78, cloth: CLOTH.sage },
  { x: 890, foot: 480, tall: 130, half: 70, cloth: CLOTH.pale },
  { x: 270, foot: 484, tall: 190, half: 92, cloth: CLOTH.pale },
  { x: 640, foot: 490, tall: 120, half: 64, cloth: CLOTH.pale, door: true },
  { x: 1265, foot: 500, tall: 240, half: 118, cloth: CLOTH.pale, door: true },
  { x: 1520, foot: 506, tall: 272, half: 122, cloth: CLOTH.pale },
  { x: 1820, foot: 482, tall: 176, half: 88, cloth: CLOTH.sage },
];

const tent = (ctx: CanvasRenderingContext2D, t: Tent, hand: Hand) => {
  const { x, foot, tall, half } = t;
  const peak: Pt = [x, foot - tall];
  const dip = 0.06 * half;
  ctx.save();
  ctx.globalAlpha *= 0.6;
  contact(ctx, x + 0.25 * half, foot + 2, 1.1 * half);
  ctx.restore();
  ctx.fillStyle = TENT_POLE;
  ctx.fillRect(x - 1.6, peak[1] - 0.08 * tall, 3.2, 0.08 * tall + 4);
  const style = { rim: 0, torn: 0, boil: 'none' } as const;
  cutout(
    ctx,
    [
      peak,
      [x + half, foot],
      [x + 0.5 * half, foot + 0.8 * dip],
      [x, foot + dip],
      [x - 0.5 * half, foot + 0.8 * dip],
      [x - half, foot],
    ],
    { ...style, color: t.cloth.color, shadow: 0.2 },
    hand,
  );
  cutout(
    ctx,
    [peak, [x + half, foot], [x + 0.5 * half, foot + 0.8 * dip], [x + 0.12 * half, foot + dip]],
    { ...style, color: t.cloth.shade, shadow: 0 },
    sub(hand, 1),
  );
  if (t.door !== true) return;
  cutout(
    ctx,
    [
      [x + 0.04 * half, foot - 0.3 * tall],
      [x + 0.22 * half, foot + dip],
      [x - 0.14 * half, foot + dip],
    ],
    { ...style, color: mix(t.cloth.shade, DOOR, 0.45), shadow: 0 },
    sub(hand, 2),
  );
};

export const tents = (ctx: CanvasRenderingContext2D, band: 'far' | 'near', hand: Hand) =>
  (band === 'far' ? FAR_TENTS : NEAR_TENTS).forEach((t, i) => tent(ctx, t, sub(hand, i * 3)));

const STONE = paper('#b9a69a', 0.6);
const SHRUB = paper('#93a271', 0.6);

const stoneShape = (x: number, y: number, rx: number, ry: number): Pt[] =>
  Array.from({ length: 18 }, (_, i): Pt => {
    const t = (i / 18) * 2 * Math.PI;
    const s = Math.sin(t);
    return [x + rx * Math.cos(t) * (1 + 0.06 * Math.sin(3 * t)), y + ry * s * (s > 0 ? 0.35 : 1)];
  });

const rock = (ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) => {
  ctx.save();
  ctx.globalAlpha *= 0.55;
  contact(ctx, x + 0.2 * rx, y + 0.35 * ry, 1.15 * rx);
  ctx.restore();
  cut(ctx, stoneShape(x, y, rx, ry), STONE, { line: 0 });
};

const FAN: ReadonlyArray<readonly [number, number]> = [
  [-1, 0.75],
  [-0.55, 1],
  [-0.15, 0.85],
  [0.3, 1],
  [0.75, 0.7],
];

const shrub = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
  FAN.forEach(([turn, long], i) => {
    const l = long * size;
    const w = 0.16 * size;
    const s = Math.sin(turn);
    const c = Math.cos(turn);
    const color = i % 2 === 0 ? SHRUB.color : SHRUB.shade;
    cut(
      ctx,
      [
        [x - w * c, y - w * s * 0.3],
        [x + s * l * 0.55 - c * w * 0.8, y - c * l * 0.55],
        [x + s * l, y - c * l],
        [x + s * l * 0.55 + c * w * 0.8, y - c * l * 0.55],
        [x + w * c, y + w * s * 0.3],
      ],
      { color, shade: color },
      { line: 0, flat: true },
    );
  });
};

const GROUND_ROCKS: ReadonlyArray<readonly [number, number, number, number]> = [
  [700, 836, 24, 14],
  [846, 838, 28, 16],
  [1640, 760, 26, 14],
  [-160, 780, 30, 16],
];
const GROUND_SHRUBS: ReadonlyArray<readonly [number, number, number]> = [
  [812, 826, 26],
  [686, 640, 16],
  [1600, 650, 20],
  [-120, 620, 18],
];

export const groundLitter = (ctx: CanvasRenderingContext2D) => {
  GROUND_SHRUBS.forEach(([x, y, s]) => shrub(ctx, x, y, s));
  GROUND_ROCKS.forEach(([x, y, rx, ry]) => rock(ctx, x, y, rx, ry));
};

const NEAR_ROCKS: ReadonlyArray<readonly [number, number, number, number]> = [
  [95, 968, 62, 34],
  [1505, 940, 42, 22],
  [585, 1020, 30, 16],
  [-260, 990, 70, 36],
  [1820, 1000, 60, 30],
];
const NEAR_SHRUBS: ReadonlyArray<readonly [number, number, number]> = [
  [292, 1008, 36],
  [1478, 1018, 32],
  [34, 888, 26],
  [1760, 930, 34],
];

export const nearLitter = (ctx: CanvasRenderingContext2D) => {
  NEAR_SHRUBS.forEach(([x, y, s]) => shrub(ctx, x, y, s));
  NEAR_ROCKS.forEach(([x, y, rx, ry]) => rock(ctx, x, y, rx, ry));
};

export const POLE = {
  x: 765,
  foot: 830,
  top: 36,
  topHalf: 12.5,
  footHalf: 15.5,
  sunk: 140,
  line: 4,
} as const;

const WOOD = paper('#9b7652', 0.6);
const MOUND: Torn = { color: '#dcbc93', rim: '#ecd3ae' };

interface Post {
  readonly x: number;
  readonly at: ReadonlyArray<readonly [y: number, half: number]>;
}

const CAMP_POLE: Post = {
  x: POLE.x,
  at: [
    [POLE.top, POLE.topHalf],
    [POLE.foot + POLE.sunk, POLE.footHalf],
  ],
};

const POST_FACE = 0.25;

const postShape = (p: Post, by = 0): Pt[] => [
  ...p.at.map(([y, half]): Pt => [p.x - half - by, y]),
  ...[...p.at].reverse().map(([y, half]): Pt => [p.x + half + by, y]),
];

const postShade = (p: Post): Pt[] => [
  ...p.at.map(([y, half]): Pt => [p.x + POST_FACE * half, y]),
  ...[...p.at].reverse().map(([y, half]): Pt => [p.x + half, y]),
];

const post = (ctx: CanvasRenderingContext2D, p: Post, wood: Paper, line: number) => {
  const outline = postShape(p);
  ctx.save();
  trace(ctx, outline);
  ctx.fillStyle = wood.color;
  ctx.fill();
  trace(ctx, postShade(p));
  ctx.fillStyle = wood.shade;
  ctx.fill();
  ctx.restore();
  inked(ctx, outline, line);
};

const MOUND_SHAPE: ReadonlyArray<Pt> = spline(
  [
    [POLE.x - 80, POLE.foot + 6],
    [POLE.x - 40, POLE.foot - 8],
    [POLE.x, POLE.foot - 12],
    [POLE.x + 44, POLE.foot - 7],
    [POLE.x + 86, POLE.foot + 6],
    [POLE.x + 56, POLE.foot + 14],
    [POLE.x, POLE.foot + 17],
    [POLE.x - 52, POLE.foot + 14],
  ],
  6,
  true,
);

const COIL = { from: 388, to: 122, turns: 2.25, reach: 52, w: 21 } as const;
const NECK: ReadonlyArray<Pt> = [
  [829, 106],
  [841, 90],
  [851, 80],
];
const HEAD = {
  at: [860, 74],
  rx: 21,
  ry: 12,
  rot: -0.2,
  eyeAt: [867, 68],
  tongueAt: [874, 72],
} as const;
const COIL_POINTS = 90;

const BRONZE = paper('#b38a58', 0.6);
const BRONZE_DARK: Hex = '#6a4733';
const BRONZE_GLOW: Hex = '#f3d79a';
const LIT = { color: 0.45, shade: 0.3 } as const;
const SERPENT_LIGHT = { at: [790, 220], r: 340, alpha: 0.45 } as const;

const coilAt = (s: number) => {
  const a = Math.PI / 2 - 2 * Math.PI * COIL.turns * (1 - s);
  return {
    p: [
      POLE.x + COIL.reach * Math.sin(a) * (0.7 + 0.3 * s),
      lerp(COIL.from, COIL.to, s),
    ] satisfies Pt,
    front: Math.cos(a) > 0,
  };
};

const SERPENT: { readonly spine: ReadonlyArray<Pt>; readonly front: ReadonlyArray<boolean> } =
  (() => {
    const coil = Array.from({ length: COIL_POINTS + 1 }, (_, i) => coilAt(1 - i / COIL_POINTS));
    return {
      spine: [...[...NECK].reverse(), ...coil.map((c) => c.p)],
      front: [...NECK.map(() => true), ...coil.map((c) => c.front)],
    };
  })();

const serpentWidth = (i: number): number => {
  const k = i / (SERPENT.spine.length - 1);
  return COIL.w * Math.min(lerp(0.8, 1, clamp(k * 6)), lerp(1, 0.2, clamp((k - 0.75) / 0.25)));
};

const SHADE_SIDE = { x: 0.2, y: 0.26, w: 0.5 } as const;

const creature = (
  ctx: CanvasRenderingContext2D,
  spine: ReadonlyArray<Pt>,
  width: (i: number) => number,
  p: Paper,
  line: number,
) => {
  const body = tube(spine, width);
  const side = tube(
    spine.map(([x, y], i): Pt => [x + SHADE_SIDE.x * width(i), y + SHADE_SIDE.y * width(i)]),
    (i) => SHADE_SIDE.w * width(i),
  );
  ctx.save();
  trace(ctx, body);
  ctx.fillStyle = p.color;
  ctx.fill();
  ctx.clip();
  trace(ctx, side);
  ctx.fillStyle = p.shade;
  ctx.fill();
  ctx.restore();
  inked(ctx, body, line);
};

const TONGUE: ReadonlyArray<Pt> = [
  [0, -0.09],
  [0.66, -0.09],
  [1, -0.3],
  [0.74, 0],
  [1, 0.3],
  [0.66, 0.09],
  [0, 0.09],
];

const tongue = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  a: number,
  long: number,
  color: Hex,
) => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const pts = TONGUE.map(([u, v]): Pt => [x + long * (u * c - v * s), y + long * (u * s + v * c)]);
  cut(ctx, pts, { color, shade: color }, { line: 0, flat: true });
};

const headShape = (x: number, y: number, rx: number, ry: number, a: number): Pt[] => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return ellipseShape(0, 0, rx, ry, 28).map(([u, v]): Pt => [x + u * c - v * s, y + u * s + v * c]);
};

const eye = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  ctx.fillStyle = C.outline;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fill();
};

const FRONT_RUNS: ReadonlyArray<readonly [number, number]> = (() => {
  const runs: Array<readonly [number, number]> = [];
  let start = -1;
  SERPENT.front.forEach((front, i) => {
    if (front && start < 0) start = i;
    if (!front && start >= 0) {
      runs.push([Math.max(0, start - 1), Math.min(SERPENT.front.length - 1, i)]);
      start = -1;
    }
  });
  if (start >= 0) runs.push([Math.max(0, start - 1), SERPENT.front.length - 1]);
  return runs;
})();

const serpentHead = (ctx: CanvasRenderingContext2D, p: Paper, line: number) => {
  const { at, rx, ry, rot, eyeAt, tongueAt } = HEAD;
  tongue(ctx, tongueAt[0], tongueAt[1], rot, 15, BRONZE_DARK);
  cut(ctx, headShape(at[0], at[1], rx, ry, rot), p, { line });
  eye(ctx, eyeAt[0], eyeAt[1], 2.6);
};

const bronzeLit = (lit: number): Paper => {
  const k = clamp(lit);
  return {
    color: mix(BRONZE.color, BRONZE_GLOW, LIT.color * k),
    shade: mix(BRONZE.shade, BRONZE_GLOW, LIT.shade * k),
  };
};

const serpentOn = (ctx: CanvasRenderingContext2D, p: Post, lit: number) => {
  const [lx, ly] = SERPENT_LIGHT.at;
  shine(ctx, lx, ly, SERPENT_LIGHT.r, GOLD_GLOW, SERPENT_LIGHT.alpha * lit);
  const bronze = bronzeLit(lit);
  creature(ctx, SERPENT.spine, serpentWidth, bronze, POLE.line);
  post(ctx, p, WOOD, POLE.line);
  ctx.save();
  trace(ctx, postShape(p, POLE.line / 2 + 0.5));
  ctx.clip();
  for (const [from, to] of FRONT_RUNS) {
    const run = SERPENT.spine.slice(from, to + 1);
    creature(ctx, run, (i) => serpentWidth(from + i), bronze, POLE.line);
  }
  ctx.restore();
  serpentHead(ctx, bronze, POLE.line);
};

export const poleAndSerpent = (
  ctx: CanvasRenderingContext2D,
  rise: number,
  lit: number,
  hand: Hand,
) => {
  const up = clamp(rise);
  if (up <= 0) return;
  const tall = POLE.foot - POLE.top;
  cast(ctx, POLE.x - POLE.footHalf, POLE.x + POLE.footHalf, POLE.foot, tall * up, 0.4);
  ctx.save();
  ctx.beginPath();
  ctx.rect(CAMP.left, CAMP.top, CAMP.right - CAMP.left, POLE.foot - CAMP.top);
  ctx.clip();
  ctx.translate(0, (1 - rise) * (tall + POLE.sunk));
  serpentOn(ctx, CAMP_POLE, lit);
  ctx.restore();
  ctx.save();
  ctx.translate(POLE.x, POLE.foot);
  ctx.scale(1, up);
  ctx.translate(-POLE.x, -POLE.foot);
  plane(ctx, MOUND_SHAPE, MOUND, hand);
  ctx.restore();
};

export const LIFTED = {
  x: 768,
  scale: 1.5,
  coilTop: 145,
  pole: [
    [45, 22],
    [545, 32],
    [1100, 72],
  ],
} as const;

const LOW_POLE: Post = {
  x: POLE.x,
  at: LIFTED.pole.map(([y, half]): readonly [number, number] => [
    COIL.to + (y - LIFTED.coilTop) / LIFTED.scale,
    half / LIFTED.scale,
  ]),
};

const LOW = { left: -900, right: 2500, top: -700, bottom: 1500 } as const;

const belowLow = (top: ReadonlyArray<Pt>): Pt[] => {
  const edge = spline(top, 8);
  const first = edge[0] ?? [0, 0];
  const last = edge.at(-1) ?? first;
  return [
    [LOW.left, first[1]],
    ...edge,
    [LOW.right, last[1]],
    [LOW.right, LOW.bottom],
    [LOW.left, LOW.bottom],
  ];
};

const LOW_SKY: ReadonlyArray<readonly [number, Hex]> = [
  [0, '#e9aaa7'],
  [300, '#f2c3ae'],
  [560, '#f7d9bb'],
  [720, '#f9e6c6'],
];
const LOW_WASH = LOW_SKY.map(([y, c]): readonly [number, Hex] => [
  (y - LOW.top) / (LOW.bottom - LOW.top),
  c,
]);

export const lowSky = (ctx: CanvasRenderingContext2D) =>
  wash(ctx, LOW.left, LOW.top, LOW.right - LOW.left, LOW.bottom - LOW.top, LOW_WASH);

const LOW_HILLS: ReadonlyArray<readonly [ReadonlyArray<Pt>, Torn]> = [
  [
    belowLow([
      [-900, 690],
      [-300, 680],
      [0, 672],
      [180, 676],
      [380, 700],
      [560, 690],
      [760, 676],
      [930, 700],
      [1100, 690],
      [1280, 662],
      [1430, 650],
      [1536, 655],
      [1900, 668],
      [2500, 680],
    ]),
    { color: '#d9b6bd', rim: '#ead2d3' },
  ],
  [
    belowLow([
      [-900, 745],
      [0, 738],
      [250, 752],
      [520, 742],
      [760, 760],
      [1000, 738],
      [1240, 756],
      [1536, 742],
      [2500, 750],
    ]),
    { color: '#e3c0b8', rim: '#f0d9d0' },
  ],
];

export const lowHills = (ctx: CanvasRenderingContext2D, hand: Hand) =>
  LOW_HILLS.forEach(([pts, p], i) => plane(ctx, pts, p, sub(hand, i)));

const LOW_SAND: readonly [ReadonlyArray<Pt>, Torn] = [
  belowLow([
    [-900, 790],
    [0, 786],
    [500, 794],
    [1000, 788],
    [1536, 792],
    [2500, 790],
  ]),
  { color: '#ecd2b2', rim: '#f6e3c8' },
];

const LOW_TENTS: ReadonlyArray<Tent> = [
  { x: 207, foot: 800, tall: 92, half: 45, cloth: CLOTH.pale },
  { x: 1305, foot: 800, tall: 72, half: 50, cloth: CLOTH.pale },
  { x: 1398, foot: 800, tall: 84, half: 52, cloth: CLOTH.sage },
  { x: -210, foot: 802, tall: 150, half: 85, cloth: CLOTH.sage },
  { x: 1730, foot: 802, tall: 150, half: 85, cloth: CLOTH.sage },
  { x: 50, foot: 804, tall: 172, half: 95, cloth: CLOTH.pale, door: true },
  { x: 1478, foot: 804, tall: 178, half: 100, cloth: CLOTH.pale },
];

export const lowCamp = (ctx: CanvasRenderingContext2D, hand: Hand) => {
  plane(ctx, LOW_SAND[0], LOW_SAND[1], hand);
  LOW_TENTS.forEach((t, i) => tent(ctx, t, sub(hand, 10 + i * 3)));
};

export const liftedSerpent = (ctx: CanvasRenderingContext2D, lit: number) => {
  ctx.save();
  ctx.translate(LIFTED.x, LIFTED.coilTop);
  ctx.scale(LIFTED.scale, LIFTED.scale);
  ctx.translate(-POLE.x, -COIL.to);
  serpentOn(ctx, LOW_POLE, lit);
  ctx.restore();
};

export interface Snake {
  readonly at: Pt;
  readonly facing: number;
  readonly long: number;
  readonly wave: number;
  readonly every: number;
  readonly w: number;
}

export const SNAKES = {
  left: { at: [562, 914], facing: -0.25, long: 340, wave: 15, every: 120, w: 15 },
  middle: { at: [952, 904], facing: Math.PI + 0.08, long: 230, wave: 10, every: 95, w: 12 },
  right: { at: [1230, 972], facing: Math.PI - 0.04, long: 280, wave: 12, every: 105, w: 13 },
} as const satisfies Record<string, Snake>;

const SNAKE = paper(C.scarlet, 0.5);
const SNAKE_LINE = 3;
const WRIGGLE = 3.2;
const SNAKE_POINTS = 40;
const STRIKE = { lift: 46, lunge: 34, share: 0.3 } as const;

export const snake = (
  ctx: CanvasRenderingContext2D,
  s: Snake,
  along: number,
  t: number,
  strike: number,
) => {
  const dx = Math.cos(s.facing);
  const dy = Math.sin(s.facing);
  const hx = s.at[0] + dx * along;
  const hy = s.at[1] + dy * along;
  const spine = Array.from({ length: SNAKE_POINTS + 1 }, (_, i): Pt => {
    const u = (i / SNAKE_POINTS) * s.long;
    const grown = clamp(u / (0.2 * s.long));
    const lat = s.wave * grown * Math.sin((2 * Math.PI * u) / s.every - WRIGGLE * t);
    const rear = clamp(1 - u / (STRIKE.share * s.long)) ** 2 * strike;
    return [
      hx - dx * u - dy * lat + dx * STRIKE.lunge * rear,
      hy - dy * u + dx * lat + dy * STRIKE.lunge * rear - STRIKE.lift * rear,
    ];
  });
  ctx.save();
  ctx.globalAlpha *= 0.5;
  for (let i = 0; i < SNAKE_POINTS; i += 8) {
    const [x, y] = spine[i] ?? [hx, hy];
    const rear = clamp(1 - i / (STRIKE.share * SNAKE_POINTS)) ** 2 * strike;
    contact(ctx, x + 4, y + 6 + STRIKE.lift * rear, 0.9 * s.w + 10);
  }
  ctx.restore();
  const width = (i: number) => {
    const k = i / SNAKE_POINTS;
    return s.w * Math.min(lerp(0.7, 1, clamp(k / 0.15)), lerp(1, 0.14, clamp((k - 0.3) / 0.7)));
  };
  creature(ctx, spine, width, SNAKE, SNAKE_LINE);
  const [x0, y0] = spine[0] ?? [hx, hy];
  const [x1, y1] = spine[2] ?? [hx, hy];
  const a = Math.atan2(y0 - y1, x0 - x1);
  const c = Math.cos(a);
  const n = Math.sin(a);
  tongue(ctx, x0 + 0.8 * s.w * c, y0 + 0.8 * s.w * n, a, 1.1 * s.w, SNAKE.shade);
  cut(ctx, headShape(x0 + 0.25 * s.w * c, y0 + 0.25 * s.w * n, 0.95 * s.w, 0.62 * s.w, a), SNAKE, {
    line: SNAKE_LINE,
  });
  const side = c >= 0 ? 1 : -1;
  eye(
    ctx,
    x0 + 0.5 * s.w * c + side * 0.24 * s.w * n,
    y0 + 0.5 * s.w * n - side * 0.24 * s.w * c,
    1.8,
  );
};

export interface Body {
  readonly tall: number;
  readonly head: number;
  readonly wide: number;
  readonly shoulder: number;
  readonly hem: number;
  readonly stoop: number;
}

export const BODIES = {
  slight: { tall: 366, head: 112, wide: 92, shoulder: 56, hem: 70, stoop: 0 },
  broad: { tall: 372, head: 116, wide: 100, shoulder: 78, hem: 90, stoop: 0 },
  tall: { tall: 392, head: 116, wide: 96, shoulder: 64, hem: 78, stoop: 0 },
  child: { tall: 262, head: 100, wide: 88, shoulder: 46, hem: 54, stoop: 0 },
  elder: { tall: 362, head: 114, wide: 96, shoulder: 62, hem: 74, stoop: 0.12 },
} as const satisfies Record<string, Body>;

interface Place {
  readonly body: keyof typeof BODIES;
  readonly at: Pt;
  readonly scale: number;
  readonly facing: number;
}

export const PLACES = {
  tallBack: { body: 'tall', at: [408, 770], scale: 1.02, facing: 0.45 },
  broad: { body: 'broad', at: [1000, 774], scale: 1.03, facing: -0.5 },
  elder: { body: 'elder', at: [1418, 800], scale: 1.06, facing: -0.55 },
  tallLeft: { body: 'tall', at: [128, 812], scale: 1.08, facing: 0.55 },
  climber: { body: 'broad', at: [548, 836], scale: 1.08, facing: 0.4 },
  womanLeft: { body: 'slight', at: [282, 872], scale: 1.12, facing: 0.35 },
  womanRight: { body: 'slight', at: [1160, 872], scale: 1.12, facing: -0.35 },
  child: { body: 'child', at: [1312, 902], scale: 1.16, facing: -0.45 },
} as const satisfies Record<string, Place>;

export type CamperName = keyof typeof PLACES;

export const CAMP_ORDER = [
  'tallBack',
  'broad',
  'elder',
  'tallLeft',
  'climber',
  'womanLeft',
  'womanRight',
  'child',
] as const satisfies ReadonlyArray<CamperName>;

export const LOW_ROW: Readonly<
  Record<CamperName, { readonly at: Pt; readonly scale: number; readonly facing: number }>
> = {
  tallLeft: { at: [120, 1205], scale: 1.2, facing: 0.8 },
  tallBack: { at: [290, 1201], scale: 1.15, facing: 0.75 },
  womanLeft: { at: [432, 1239], scale: 1.2, facing: 0.6 },
  climber: { at: [585, 1236], scale: 1.2, facing: 0.85 },
  broad: { at: [960, 1216], scale: 1.2, facing: -0.8 },
  womanRight: { at: [1130, 1244], scale: 1.2, facing: -0.6 },
  child: { at: [1290, 1171], scale: 1.3, facing: -0.6 },
  elder: { at: [1450, 1194], scale: 1.2, facing: -0.8 },
};

export interface CamperPose {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly facing: number;
  readonly lift: number;
  readonly lean: number;
  readonly breath: number;
  readonly hands: readonly [Pt, Pt];
  readonly feet: readonly [number, number];
  readonly line: number;
  readonly ground: boolean;
}

const restHands = (b: Body): readonly [Pt, Pt] => {
  const x = b.shoulder + 0.16 * b.wide;
  const y = -0.4 * b.tall;
  return [
    [-x, y],
    [x, y],
  ];
};

export const stand = (who: CamperName): CamperPose => {
  const c: Place = PLACES[who];
  return {
    x: c.at[0],
    y: c.at[1],
    scale: c.scale,
    facing: c.facing,
    lift: 0,
    lean: 0,
    breath: 0,
    hands: restHands(BODIES[c.body]),
    feet: [0, 0],
    line: 1,
    ground: true,
  };
};

export const bodyOf = (who: CamperName): Body => BODIES[PLACES[who].body];

const turned = ([x, y]: Pt, [ox, oy]: Pt, a: number): Pt => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [ox + (x - ox) * c - (y - oy) * s, oy + (x - ox) * s + (y - oy) * c];
};

const TIP = 0.42;

const MASS = ramp('#a58a7c', keyLight, shading);
const MASS_TURN: Crease = { at: 0.62, soft: 0.05 };
const MASS_LINE = 5;

const massCut = (ctx: CanvasRenderingContext2D, pts: ReadonlyArray<Pt>) => {
  const { start, end, at } = creaseOf(boxOf(pts), MASS_TURN);
  const soft = MASS_TURN.soft ?? 0;
  const g = ctx.createLinearGradient(start[0], start[1], end[0], end[1]);
  g.addColorStop(0, MASS.base);
  g.addColorStop(clamp(at - soft / 2), MASS.base);
  g.addColorStop(clamp(at + soft / 2), MASS.shade);
  g.addColorStop(1, MASS.shade);
  trace(ctx, pts);
  ctx.fillStyle = g;
  ctx.fill();
};

export const campMass = (ctx: CanvasRenderingContext2D, who: CamperName, p: CamperPose) => {
  const b = bodyOf(who);
  const W = b.wide;
  const H = b.head;
  const T = b.tall;
  const f = clamp(p.facing, -1, 1);
  const crown = -T;
  const chin = crown + H;
  const breathe = 1 + 0.006 * Math.sin(p.breath);
  const onBody = ([x, y]: Pt): Pt => turned([x, y * breathe], [0, 0], p.lean);
  const mid: Pt = [
    0.08 * W * f + b.stoop * 0.45 * H * (f >= 0 ? 1 : -1),
    crown + 0.5 * H + b.stoop * 0.1 * H,
  ];
  const neck: Pt = [mid[0], chin + 0.06 * H];
  const onHead = (pt: Pt): Pt => onBody(turned(pt, neck, -TIP * p.lift * f));
  const sh = chin + 0.04 * H;
  const side = (s: number): Pt[] =>
    spline(
      [
        [s * 0.24 * W, sh],
        [s * 0.92 * b.shoulder, sh + 0.12 * H],
        [s * b.shoulder, sh + 0.36 * H],
        [s * lerp(b.shoulder, b.hem, 0.55), lerp(sh, 0, 0.55)],
        [s * b.hem, 0],
      ],
      5,
    );
  const body = [...side(-1), ...side(1).reverse()].map(onBody);
  const head = ellipseShape(mid[0], mid[1], W / 2, H / 2, 40).map(onHead);
  const r = 0.17 * W;
  const hands = p.hands.map((at) => {
    const [x, y] = onBody(at);
    return ellipseShape(x, y, r, r, 28);
  });

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(p.scale, p.scale);
  if (p.ground) {
    cast(ctx, -0.8 * b.hem, 0.8 * b.hem, 0, 0.75 * T, 0.32);
    contact(ctx, 0, 0, 1.05 * b.hem);
  }
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 2 * MASS_LINE * p.line;
  for (const part of [body, head]) {
    trace(ctx, part);
    unprobed(ctx, () => ctx.stroke());
  }
  massCut(ctx, body);
  massCut(ctx, head);
  for (const hand of hands) {
    trace(ctx, hand);
    unprobed(ctx, () => ctx.stroke());
    massCut(ctx, hand);
  }
  ctx.restore();
  const [cx, cy] = onHead(mid);
  probeFace(ctx, cx, cy, 0.7 * H);
  ctx.restore();
};
