import {
  type Hand,
  type Hex,
  type Pt,
  clearOf,
  cutout,
  ellipseShape,
  glow,
  length,
  mix,
  spline,
  sub,
  trim,
  unprobed,
  wash,
} from '@manna/film/canvas';
import { clamp, lerp } from '@manna/film/core';
import { cut } from './court-set.ts';
import { C } from './kit.ts';
import { GOLD_GLOW, type Paper, paper } from './page-set.ts';
import { type OpenSeedPose, glow as shine, openSeed } from './props.ts';
import { PAPERS } from './rigs/papers.ts';

export interface Torn {
  readonly color: Hex;
  readonly rim: Hex;
}

const RUN = { left: -700, right: 2300, top: -900, bottom: 1700 } as const;

const TEAR = { torn: 2.5, rim: 2.5, shadow: 0.3, rougher: 1.3 } as const;

export const ICON_LINE = 5;

export const DARK = {
  sky: '#25224f',
  bands: [
    { color: '#4a3c7b', rim: '#7769ba' },
    { color: '#1f2247', rim: '#6a62b3' },
    { color: '#232456', rim: '#7c72c6' },
  ],
} as const satisfies { readonly sky: Hex; readonly bands: ReadonlyArray<Torn> };

const FRONT_LIT: Torn = { color: '#2b2b6b', rim: '#9a8fd2' };

const MADE = {
  hills: { color: '#c99b94', rim: '#f5dccb' },
  land: { color: '#c9a26b', rim: '#f6e4b8' },
  shore: { color: '#c19867', rim: '#f2dcb0' },
  water: { color: '#4ea2a5', rim: '#9fd6cc' },
} as const satisfies Record<string, Torn>;

const DEEP = { from: 690, run: 220, color: '#2c7c8d' } as const satisfies {
  readonly from: number;
  readonly run: number;
  readonly color: Hex;
};

const GLINT = { x: 880, y: 642, rx: 300, ry: 9, color: '#fff0bf', alpha: 0.8 } as const;

const under = (top: ReadonlyArray<Pt>): Pt[] => {
  const edge = spline(top, 8);
  const first = edge[0] ?? [0, 0];
  const last = edge.at(-1) ?? first;
  return [
    [RUN.left, first[1]],
    ...edge,
    [RUN.right, last[1]],
    [RUN.right, RUN.bottom],
    [RUN.left, RUN.bottom],
  ];
};

const BANDS: ReadonlyArray<ReadonlyArray<Pt>> = [
  under([
    [-80, 575],
    [120, 568],
    [280, 557],
    [460, 578],
    [700, 615],
    [900, 640],
    [1060, 628],
    [1290, 600],
    [1536, 595],
    [1700, 592],
  ]),
  under([
    [-80, 626],
    [150, 628],
    [380, 645],
    [620, 690],
    [870, 721],
    [1000, 708],
    [1200, 682],
    [1400, 664],
    [1536, 656],
    [1700, 650],
  ]),
  under([
    [-80, 806],
    [150, 790],
    [420, 772],
    [650, 776],
    [900, 795],
    [1100, 812],
    [1300, 835],
    [1450, 856],
    [1536, 868],
    [1700, 885],
  ]),
];

const HILLS = under([
  [-80, 552],
  [100, 540],
  [260, 526],
  [420, 540],
  [600, 568],
  [800, 606],
  [880, 608],
  [1000, 582],
  [1080, 576],
  [1200, 584],
  [1350, 596],
  [1536, 598],
  [1700, 598],
]);

const WATER = under([
  [-80, 636],
  [1700, 636],
]);

const LAND: ReadonlyArray<Pt> = [
  [RUN.left, 592],
  ...spline(
    [
      [-80, 590],
      [150, 592],
      [350, 603],
      [520, 622],
      [640, 648],
      [668, 659],
    ],
    8,
  ),
  [600, 666],
  [300, 668],
  [-80, 670],
  [RUN.left, 672],
];

const SHORE: ReadonlyArray<Pt> = [
  [758, 707],
  ...spline(
    [
      [770, 703],
      [860, 690],
      [1000, 664],
      [1150, 632],
      [1300, 602],
      [1450, 578],
      [1536, 568],
      [1700, 556],
      [RUN.right, 545],
    ],
    8,
  ),
  [RUN.right, 714],
  [1536, 707],
  [760, 709],
];

export const plane = (
  ctx: CanvasRenderingContext2D,
  pts: ReadonlyArray<Pt>,
  p: Torn,
  hand: Hand,
  alpha = 1,
) => {
  ctx.save();
  ctx.translate(0, -TEAR.rim);
  cutout(
    ctx,
    pts,
    {
      color: p.rim,
      rim: 0,
      torn: TEAR.torn * TEAR.rougher,
      shadow: TEAR.shadow,
      alpha: alpha * alpha,
      boil: 'none',
    },
    hand,
  );
  ctx.restore();
  cutout(
    ctx,
    pts,
    { color: p.color, rim: 0, torn: TEAR.torn, shadow: 0, alpha, boil: 'none' },
    hand,
  );
};

const SINK = 140;

export const darkBand = (ctx: CanvasRenderingContext2D, i: number, hand: Hand, sunk: number) => {
  const pts = BANDS[i];
  const p = DARK.bands[i];
  if (pts === undefined || p === undefined || sunk >= 1) return;
  ctx.save();
  ctx.translate(0, SINK * sunk);
  plane(ctx, pts, p, hand, 1 - sunk);
  ctx.restore();
};

export const frontBand = (ctx: CanvasRenderingContext2D, hand: Hand, lit: number) => {
  const pts = BANDS[2];
  const dark = DARK.bands[2];
  if (pts === undefined) return;
  plane(
    ctx,
    pts,
    { color: mix(dark.color, FRONT_LIT.color, lit), rim: mix(dark.rim, FRONT_LIT.rim, lit) },
    hand,
  );
};

export const hills = (ctx: CanvasRenderingContext2D, hand: Hand) =>
  plane(ctx, HILLS, MADE.hills, hand);

export const land = (ctx: CanvasRenderingContext2D, hand: Hand) =>
  plane(ctx, LAND, MADE.land, hand);
export const shore = (ctx: CanvasRenderingContext2D, hand: Hand) =>
  plane(ctx, SHORE, MADE.shore, hand);

export const water = (ctx: CanvasRenderingContext2D, hand: Hand, lit: number) => {
  plane(ctx, WATER, MADE.water, hand);
  wash(ctx, RUN.left, DEEP.from, RUN.right - RUN.left, DEEP.run, [
    [0, clearOf(DEEP.color)],
    [1, DEEP.color],
  ]);
  ctx.save();
  ctx.fillStyle = DEEP.color;
  ctx.fillRect(RUN.left, DEEP.from + DEEP.run, RUN.right - RUN.left, RUN.bottom);
  ctx.restore();
  if (lit <= 0) return;
  ctx.save();
  ctx.translate(GLINT.x, GLINT.y);
  ctx.scale(1, GLINT.ry / GLINT.rx);
  shine(ctx, 0, 0, GLINT.rx, GLINT.color, GLINT.alpha * lit);
  ctx.restore();
};

export const SUN = {
  at: [1190, 298],
  r: 70,
  rays: 6,
  from: 100,
  to: 196,
  half: [15, 30],
  turn: -1.66,
} as const;

type Stops = ReadonlyArray<readonly [number, Hex]>;

const DAWN: Stops = [
  [0, '#3d3a7e'],
  [200, '#7d5b8f'],
  [380, '#d8938a'],
  [500, '#f2b98c'],
  [600, '#f8d79c'],
];

const DAY: Stops = [
  [0, '#3c3c84'],
  [150, '#3e6c92'],
  [260, '#4b8496'],
  [340, '#8f8e9e'],
  [410, '#d59d8d'],
  [480, '#edb98c'],
  [560, '#f6d89f'],
  [650, '#f8e2ae'],
];

const over = (stops: Stops): Stops =>
  stops.map(([y, c]): readonly [number, Hex] => [(y - RUN.top) / (RUN.bottom - RUN.top), c]);

const DAWN_WASH = over(DAWN);
const DAY_WASH = over(DAY);

const layer = (ctx: CanvasRenderingContext2D, alpha: number, draw: () => void) => {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= Math.min(1, alpha);
  draw();
  ctx.restore();
};

const FLOOD = { reach: 1700, soft: 360 } as const;

const floodEdge = (flood: number) => FLOOD.reach * flood - FLOOD.soft / 2;

const night = (ctx: CanvasRenderingContext2D, flood: number) => {
  if (flood >= 1) return;
  const [x, y] = SUN.at;
  const r = FLOOD.reach * flood;
  ctx.save();
  if (flood <= 0) ctx.fillStyle = DARK.sky;
  else {
    const g = ctx.createRadialGradient(x, y, Math.max(0, r - FLOOD.soft), x, y, r);
    g.addColorStop(0, clearOf(DARK.sky));
    g.addColorStop(1, DARK.sky);
    ctx.fillStyle = g;
  }
  ctx.fillRect(RUN.left, RUN.top, RUN.right - RUN.left, RUN.bottom - RUN.top);
  ctx.restore();
};

export const sky = (ctx: CanvasRenderingContext2D, flood: number, day: number) => {
  const w = RUN.right - RUN.left;
  const h = RUN.bottom - RUN.top;
  if (flood > 0) {
    wash(ctx, RUN.left, RUN.top, w, h, DAWN_WASH);
    layer(ctx, day, () => wash(ctx, RUN.left, RUN.top, w, h, DAY_WASH));
  }
  night(ctx, flood);
};

const SUN_PAPER = { disc: '#f6d15a', core: '#fde68f', ray: '#f7d660' } as const;

const SUN_AIR = { color: '#ffe2a4', r: 620, alpha: 0.75 } as const;
const SUN_LIGHT = { r: 300, alpha: 0.5 } as const;

const RING = { width: 30, alpha: 0.7 } as const;

const ray = (x: number, y: number, a: number, s: number): Pt[] => {
  const c = Math.cos(a);
  const n = Math.sin(a);
  const from = SUN.from * s;
  const to = SUN.to * s;
  const h0 = SUN.half[0] * s;
  const h1 = SUN.half[1] * s;
  return [
    [x + c * from - n * h0, y + n * from + c * h0],
    [x + c * to - n * h1, y + n * to + c * h1],
    [x + c * to + n * h1, y + n * to - c * h1],
    [x + c * from + n * h0, y + n * from - c * h0],
  ];
};

const sunCut = (ctx: CanvasRenderingContext2D, pts: ReadonlyArray<Pt>, color: Hex, hand: Hand) =>
  cutout(ctx, pts, { color, rim: 0, torn: 1.5, shadow: 0, boil: 'none' }, hand);

export const sun = (ctx: CanvasRenderingContext2D, burst: number, air: number, hand: Hand) => {
  if (burst <= 0) return;
  const [x, y] = SUN.at;
  const k = clamp(burst);
  glow(ctx, x, y, SUN_AIR.r, SUN_AIR.color, SUN_AIR.alpha * k * clamp(air));
  shine(ctx, x, y, SUN_LIGHT.r, GOLD_GLOW, SUN_LIGHT.alpha * k);
  for (let i = 0; i < SUN.rays; i++)
    sunCut(
      ctx,
      ray(x, y, SUN.turn + (i * 2 * Math.PI) / SUN.rays, burst),
      SUN_PAPER.ray,
      sub(hand, i),
    );
  const r = SUN.r * burst;
  sunCut(ctx, ellipseShape(x, y, r, r, 48), SUN_PAPER.disc, hand);
  glow(ctx, x - 0.2 * r, y - 0.2 * r, 0.7 * r, SUN_PAPER.core, 0.8 * k);
};

export const sunRing = (ctx: CanvasRenderingContext2D, flood: number) => {
  if (flood <= 0 || flood >= 1) return;
  const [x, y] = SUN.at;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha *= RING.alpha * (1 - flood);
  ctx.strokeStyle = GOLD_GLOW;
  ctx.lineWidth = RING.width * (1 - flood) + 2;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(SUN.r, floodEdge(flood)), 0, 2 * Math.PI);
  unprobed(ctx, () => ctx.stroke());
  ctx.restore();
};

const ARC = { from: [70, 415], via: [770, 100], to: [1124, 278] } as const;

const along = (t: number): Pt => {
  const u = 1 - t;
  return [
    u * u * ARC.from[0] + 2 * u * t * ARC.via[0] + t * t * ARC.to[0],
    u * u * ARC.from[1] + 2 * u * t * ARC.via[1] + t * t * ARC.to[1],
  ];
};

const heading = (t: number): number => {
  const dx = 2 * (1 - t) * (ARC.via[0] - ARC.from[0]) + 2 * t * (ARC.to[0] - ARC.via[0]);
  const dy = 2 * (1 - t) * (ARC.via[1] - ARC.from[1]) + 2 * t * (ARC.to[1] - ARC.via[1]);
  return Math.atan2(dy, dx);
};

const RIBBON = {
  tail: 12,
  head: 44,
  color: '#ecc458',
  light: '#f8de8a',
  glow: 30,
  halo: 'rgba(255, 214, 110, 0.9)',
} as const;
const RIBBON_POINTS = 40;

const edge = (tail: number, head: number, share: number): Pt[] =>
  Array.from({ length: RIBBON_POINTS + 1 }, (_, i): Pt => {
    const t = lerp(tail, head, i / RIBBON_POINTS);
    const [x, y] = along(t);
    const a = heading(t);
    const off = (share * lerp(RIBBON.tail, RIBBON.head, t)) / 2;
    return [x - Math.sin(a) * off, y + Math.cos(a) * off];
  });

const strip = (a: ReadonlyArray<Pt>, b: ReadonlyArray<Pt>): Pt[] => [...a, ...[...b].reverse()];

export const wordOfLight = (
  ctx: CanvasRenderingContext2D,
  tail: number,
  head: number,
  alpha: number,
  hand: Hand,
) => {
  if (head <= tail || alpha <= 0) return;
  const upper = edge(tail, head, -1);
  const ribbon = strip(upper, edge(tail, head, 1));
  ctx.save();
  ctx.globalAlpha *= Math.min(1, alpha);
  ctx.save();
  ctx.shadowColor = RIBBON.halo;
  ctx.shadowBlur = RIBBON.glow;
  ctx.fillStyle = RIBBON.color;
  ctx.beginPath();
  ribbon.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  cutout(ctx, ribbon, { color: RIBBON.color, rim: 0, torn: 1, shadow: 0, boil: 'none' }, hand);
  cutout(
    ctx,
    strip(upper, edge(tail, head, -0.35)),
    { color: RIBBON.light, rim: 0, torn: 0, shadow: 0, grain: 0, boil: 'none' },
    sub(hand, 1),
  );
  ctx.restore();
};

export const spark = (ctx: CanvasRenderingContext2D, t: number, amount: number) => {
  if (amount <= 0) return;
  const [x, y] = along(t);
  shine(ctx, x, y, 110, GOLD_GLOW, amount);
  shine(ctx, x, y, 34, '#fff8e0', amount);
};

export const STARS: ReadonlyArray<readonly [number, number, number]> = [
  [470, 125, 17],
  [150, 178, 15],
  [770, 112, 14],
  [335, 270, 11],
  [640, 208, 12],
  [1440, 142, 15],
  [905, 168, 10],
  [1452, 382, 11],
];

const STAR_PAPER: Paper = { color: '#f5d164', shade: '#dcae45' };
const STAR_WAIST = 0.45;
const STAR_GLINT = { reach: 3.2, alpha: 0.45, twinkle: 0.25 } as const;

const starShape = (x: number, y: number, r: number): Pt[] =>
  Array.from({ length: 10 }, (_, i): Pt => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const k = i % 2 === 0 ? r : r * STAR_WAIST;
    return [x + k * Math.cos(a), y + k * Math.sin(a)];
  });

export const star = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  k: number,
  twinkle: number,
) => {
  if (k <= 0) return;
  const shown = clamp(k);
  shine(
    ctx,
    x,
    y,
    r * STAR_GLINT.reach,
    GOLD_GLOW,
    STAR_GLINT.alpha * shown * (1 + STAR_GLINT.twinkle * twinkle),
  );
  cut(ctx, starShape(x, y, r * k), STAR_PAPER, { line: 0, alpha: shown });
};

const SEAL_ROUND: ReadonlyArray<Pt> = Array.from({ length: 49 }, (_, i): Pt => {
  const a = -Math.PI / 2 + (i / 48) * 2 * Math.PI;
  const r = 23 + 1.4 * Math.sin(a * 6 + 0.7);
  return [r * Math.cos(a), r * Math.sin(a)];
});
const SEAL_ROUND_LENGTH = length(SEAL_ROUND);

const SEAL_TAILS: ReadonlyArray<ReadonlyArray<Pt>> = [-1, 1].map((side) =>
  (
    [
      [4, 10],
      [18, 48],
      [10, 42],
      [4, 50],
      [-6, 14],
      [4, 10],
    ] as const
  ).map(([x, y]): Pt => [side * x * 0.85, y * 0.85]),
);

const SEAL_CLEAR = 80;

const path = (ctx: CanvasRenderingContext2D, pts: ReadonlyArray<Pt>) => {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
};

export const sealTrace = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  round: number,
  tails: number,
  alpha: number,
) => {
  if (alpha <= 0 || round <= 0) return;
  ctx.save();
  ctx.globalAlpha *= Math.min(1, alpha);
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = ICON_LINE / scale;
  ctx.strokeStyle = C.outline;
  path(ctx, trim(SEAL_ROUND, SEAL_ROUND_LENGTH * clamp(round)));
  unprobed(ctx, () => ctx.stroke());
  if (tails > 0) {
    path(ctx, SEAL_ROUND);
    ctx.rect(-SEAL_CLEAR, -SEAL_CLEAR, 2 * SEAL_CLEAR, 2 * SEAL_CLEAR);
    ctx.clip('evenodd');
    for (const tail of SEAL_TAILS) {
      path(ctx, trim(tail, length(tail) * clamp(tails)));
      unprobed(ctx, () => ctx.stroke());
    }
  }
  ctx.restore();
};

export const ROW = {
  faith: [798, 800],
  cloth: [1106, 800],
  blade: [1369, 800],
} as const satisfies Record<string, Pt>;

export const ICON_BOX = {
  faith: { dx: 0, up: 99, tall: 198, wide: 198 },
  cloth: { dx: 2, up: 91, tall: 182, wide: 276 },
  blade: { dx: 38, up: 145, tall: 290, wide: 120 },
} as const;

const HAND_R = ICON_BOX.faith.up;
const HAND_PAPER: Paper = { color: PAPERS.leadHand.color, shade: PAPERS.leadHand.shade };

export const handCircle = (ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) => {
  const r = HAND_R * scale;
  cut(ctx, ellipseShape(x, y - r, r, r, 72), HAND_PAPER, { line: ICON_LINE });
};

export const ON_HAND = { dx: 8, dy: -201, size: 72, rot: 0.95, glow: 0.3 } as const;

export const seedOnHand = (x: number, y: number, scale: number, out: OpenSeedPose) => {
  out.x = x + ON_HAND.dx * scale;
  out.y = y + ON_HAND.dy * scale;
  out.rot = ON_HAND.rot;
  out.size = ON_HAND.size * scale;
  out.open = 0;
  out.grown = 1;
  out.glow = ON_HAND.glow;
  out.line = ICON_LINE;
  out.shown = 1;
  return out;
};

export const faithIcon = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  out: OpenSeedPose,
) => {
  handCircle(ctx, x, y, scale);
  openSeed(ctx, seedOnHand(x, y, scale, out));
};

const CLOTH = {
  under: [
    [-112, -38],
    [44, -23],
    [46, -9],
    [-106, -10],
  ],
  far: [
    [-72, -182],
    [93, -182],
    [140, -57],
    [51, 0],
  ],
  near: [
    [-72, -182],
    [93, -182],
    [51, 0],
    [-136, -57],
  ],
} as const satisfies Record<string, ReadonlyArray<Pt>>;

const CLOTH_PAPER: Paper = {
  color: PAPERS.robe.color,
  shade: PAPERS.robe.shade ?? PAPERS.robe.color,
};
const CLOTH_FAR: Paper = { color: CLOTH_PAPER.shade, shade: CLOTH_PAPER.shade };

const placed = (pts: ReadonlyArray<Pt>, x: number, y: number, scale: number): Pt[] =>
  pts.map(([px, py]): Pt => [x + px * scale, y + py * scale]);

export const clothIcon = (ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) => {
  cut(ctx, placed(CLOTH.under, x, y, scale), CLOTH_PAPER, { line: ICON_LINE, flat: true });
  cut(ctx, placed(CLOTH.far, x, y, scale), CLOTH_FAR, { line: ICON_LINE, flat: true });
  cut(ctx, placed(CLOTH.near, x, y, scale), CLOTH_PAPER, { line: ICON_LINE });
};

const BLADE = {
  near: [
    [-12, 0],
    [-28, -70],
    [-32, -140],
    [-14, -205],
    [30, -258],
    [89, -290],
  ],
  far: [
    [12, 0],
    [18, -70],
    [30, -140],
    [46, -205],
    [66, -252],
    [89, -290],
  ],
  rib: [
    [0, 0],
    [-6, -70],
    [-2, -140],
    [16, -205],
    [50, -256],
    [89, -290],
  ],
} as const satisfies Record<string, ReadonlyArray<Pt>>;

const BLADE_PAPER: Paper = paper('#86a85a', 0.6);

const flat = (ctx: CanvasRenderingContext2D, pts: ReadonlyArray<Pt>, color: Hex) =>
  cut(ctx, pts, { color, shade: color }, { line: 0, flat: true });

export const bladeIcon = (ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) => {
  const near = placed(spline(BLADE.near, 8), x, y, scale);
  const far = placed(spline(BLADE.far, 8), x, y, scale);
  const rib = placed(spline(BLADE.rib, 8), x, y, scale);
  flat(ctx, [...near, ...[...rib].reverse()], BLADE_PAPER.color);
  flat(ctx, [...rib, ...[...far].reverse()], BLADE_PAPER.shade);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = ICON_LINE;
  ctx.strokeStyle = C.outline;
  path(ctx, [...near, ...[...far].reverse()]);
  ctx.closePath();
  unprobed(ctx, () => ctx.stroke());
  ctx.restore();
};
