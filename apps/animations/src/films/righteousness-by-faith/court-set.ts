import { type Camera, type Hex, mix, ramp, unprobed } from '@manna/film/canvas';
import { lerp, rng } from '@manna/film/core';
import { type Pt, boxOf, creaseOf, keyLight, shading } from '@manna/film/style';
import { C } from './kit.ts';

export const REST: Camera = { x: 768, y: 495, zoom: 1.25 };

export const REST_POINT: readonly [number, number] = [REST.x, REST.y];

export const PLACE = {
  lead: [293, 725],
  prosecutor: [748, 800],
  judge: [1312, 196],
  christ: [471, 733],
} as const satisfies Record<string, Pt>;

const LINE = 5;
const LINE_SMALL = 3.5;

interface SetPaper {
  readonly color: Hex;
  readonly shade: Hex;
}

const SET_SHADE = 0.5;

const paper = (base: Hex): SetPaper => {
  const r = ramp(base, keyLight, shading);
  return { color: r.base, shade: mix(r.base, r.shade, SET_SHADE) };
};

const P = {
  wall: paper('#f3e9d5'),
  column: paper('#d9b58f'),
  columnDeep: paper('#c49a72'),
  wainscot: paper('#6fa4a6'),
  wainscotRail: paper('#86b8b6'),
  floor: paper('#efe6ee'),
  wood: paper('#b47a4c'),
  woodLight: paper('#c58d5c'),
  bench: paper('#a8703f'),
  benchTop: paper('#bc8352'),
  chair: paper('#a53f31'),
  frame: paper('#93b5b2'),
  sheet: paper('#fbf6ee'),
  gavel: paper('#8a5332'),
} as const;

const SHADOW: Hex = '#b7a3dc';
const BEAM: Hex = '#fff0bf';

const SUN = { color: '#ffe3b3', at: [-160, -220], r: 1000, alpha: 0.55 } as const;

const HAZE = { color: '#fbf3e6', alpha: 0.2 } as const;

export const box = (x: number, y: number, w: number, h: number): Pt[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

const trace = (ctx: CanvasRenderingContext2D, pts: ReadonlyArray<Pt>) => {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
};

export const cut = (
  ctx: CanvasRenderingContext2D,
  pts: ReadonlyArray<Pt>,
  p: SetPaper,
  opts: { readonly line?: number; readonly flat?: boolean; readonly alpha?: number } = {},
) => {
  ctx.save();
  if (opts.alpha !== undefined) ctx.globalAlpha *= opts.alpha;
  trace(ctx, pts);
  if (opts.flat === true) ctx.fillStyle = p.color;
  else {
    const { start, end, at } = creaseOf(boxOf(pts));
    const g = ctx.createLinearGradient(start[0], start[1], end[0], end[1]);
    g.addColorStop(0, p.color);
    g.addColorStop(at, p.color);
    g.addColorStop(Math.min(1, at + 0.002), p.shade);
    g.addColorStop(1, p.shade);
    ctx.fillStyle = g;
  }
  ctx.fill();
  const line = opts.line ?? LINE;
  if (line > 0) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = line;
    ctx.strokeStyle = C.outline;
    unprobed(ctx, () => ctx.stroke());
  }
  ctx.restore();
};

export const floorShadow = (
  ctx: CanvasRenderingContext2D,
  pts: ReadonlyArray<Pt>,
  alpha: number,
) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = SHADOW;
  trace(ctx, pts);
  ctx.fill();
  ctx.restore();
};

const thrown = (x0: number, x1: number, y: number, h: number): Pt[] => {
  const dx = 0.5 * h;
  const dy = 0.22 * h;
  return [
    [x0, y],
    [x1, y],
    [x1 + dx, y + dy],
    [x0 + dx, y + dy],
  ];
};

export const contact = (ctx: CanvasRenderingContext2D, x: number, y: number, rx: number) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.26);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `${SHADOW}c0`);
  g.addColorStop(1, `${SHADOW}00`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();
};

const ROOM = {
  left: -1300,
  right: 2900,
  top: -700,
  wainscot: 418,
  floor: 715,
  bottom: 1700,
} as const;

const COLUMNS = [-1060, -520, 62, 617, 1087, 1542, 2000, 2470] as const;

const WINDOW = { x: 170, y: -10, w: 330, h: 316 } as const;
const SINK = 20;

const column = (ctx: CanvasRenderingContext2D, x: number) => {
  const w = 96;
  cut(ctx, box(x - w / 2, ROOM.top, w, ROOM.wainscot - ROOM.top), P.column, { line: 0 });
  cut(ctx, box(x - w / 2 - 10, ROOM.wainscot - 58, w + 20, 30), P.columnDeep, { line: 0 });
  cut(ctx, box(x - w / 2 - 16, ROOM.wainscot - 28, w + 32, 28), P.columnDeep, { line: 0 });
  ctx.save();
  ctx.strokeStyle = `${P.column.shade}`;
  ctx.lineWidth = 6;
  for (const dx of [-18, 18]) {
    ctx.beginPath();
    ctx.moveTo(x + dx, ROOM.top);
    ctx.lineTo(x + dx, ROOM.wainscot - 70);
    unprobed(ctx, () => ctx.stroke());
  }
  ctx.restore();
};

const window_ = (ctx: CanvasRenderingContext2D) => {
  const { x, y, w, h } = WINDOW;
  cut(ctx, box(x, y, w, h), P.frame, { line: 0 });
  const ix = x + 22;
  const iy = y + 22;
  const iw = w - 44;
  const ih = h - 44;
  ctx.save();
  trace(ctx, box(ix, iy, iw, ih));
  ctx.clip();
  const sky = ctx.createLinearGradient(0, iy, 0, iy + ih);
  sky.addColorStop(0, '#8fcbe8');
  sky.addColorStop(1, '#e4f3f6');
  ctx.fillStyle = sky;
  ctx.fillRect(ix, iy, iw, ih);
  ctx.fillStyle = '#f6fbfb';
  ctx.beginPath();
  ctx.ellipse(ix + 60, iy + 70, 48, 16, 0, 0, 2 * Math.PI);
  ctx.ellipse(ix + 95, iy + 62, 30, 20, 0, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = '#9fb3dc';
  for (const [bx, bw, bh] of [
    [70, 60, 90],
    [125, 80, 120],
    [200, 50, 70],
  ] as const)
    ctx.fillRect(ix + bx, iy + ih - bh, bw, bh);
  ctx.fillStyle = '#4f9a8f';
  for (const [cx, ch, cw] of [
    [40, 110, 16],
    [250, 170, 22],
    [278, 120, 16],
    [62, 70, 11],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(ix + cx, iy + ih - ch / 2 + SINK, cw, ch / 2 + SINK, 0, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.restore();
  ctx.save();
  ctx.lineWidth = 4;
  ctx.strokeStyle = P.frame.shade;
  trace(ctx, box(ix, iy, iw, ih));
  unprobed(ctx, () => ctx.stroke());
  ctx.restore();
  cut(ctx, box(x - 14, y + h - 6, w + 28, 22), P.frame, { line: 0 });
};

const wainscot = (ctx: CanvasRenderingContext2D) => {
  cut(
    ctx,
    box(ROOM.left, ROOM.wainscot, ROOM.right - ROOM.left, ROOM.floor - ROOM.wainscot),
    P.wainscot,
    {
      flat: true,
    },
  );
  cut(ctx, box(ROOM.left, ROOM.wainscot, ROOM.right - ROOM.left, 22), P.wainscotRail, {
    line: 0,
    flat: true,
  });
  ctx.save();
  ctx.strokeStyle = P.wainscot.shade;
  ctx.lineWidth = 5;
  for (let x = ROOM.left + 40; x < ROOM.right - 300; x += 400) {
    unprobed(ctx, () =>
      ctx.strokeRect(x, ROOM.wainscot + 60, 340, ROOM.floor - ROOM.wainscot - 110),
    );
  }
  ctx.restore();
};

const beams = (ctx: CanvasRenderingContext2D) => {
  ctx.save();
  for (const [x0, w, a] of [
    [-40, 90, 0.42],
    [120, 70, 0.32],
    [250, 120, 0.26],
  ] as const) {
    const g = ctx.createLinearGradient(x0, -200, x0 + 760, 1000);
    g.addColorStop(0, `${BEAM}ff`);
    g.addColorStop(1, `${BEAM}00`);
    ctx.globalAlpha = a;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0, -200);
    ctx.lineTo(x0 + w, -200);
    ctx.lineTo(x0 + w + 760, 1000);
    ctx.lineTo(x0 + 760, 1000);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
};

const sunGlow = (ctx: CanvasRenderingContext2D) => {
  ctx.save();
  const [x, y] = SUN.at;
  const g = ctx.createRadialGradient(x, y, 0, x, y, SUN.r);
  g.addColorStop(0, `${SUN.color}ff`);
  g.addColorStop(0.45, `${SUN.color}99`);
  g.addColorStop(1, `${SUN.color}00`);
  ctx.globalAlpha = SUN.alpha;
  ctx.fillStyle = g;
  ctx.fillRect(x - SUN.r, y - SUN.r, 2 * SUN.r, 2 * SUN.r);
  ctx.restore();
};

export const backWall = (ctx: CanvasRenderingContext2D) => {
  const top = ROOM.top - 400;
  const height = ROOM.floor - top;
  ctx.fillStyle = P.wall.color;
  ctx.fillRect(ROOM.left, top, ROOM.right - ROOM.left, ROOM.wainscot - top);
  window_(ctx);
  for (const x of COLUMNS) column(ctx, x);
  wainscot(ctx);
  ctx.save();
  ctx.globalAlpha = HAZE.alpha;
  ctx.fillStyle = HAZE.color;
  ctx.fillRect(ROOM.left, top, ROOM.right - ROOM.left, height);
  ctx.restore();
  sunGlow(ctx);
};

const CRACK: ReadonlyArray<Pt> = [
  [352, 830],
  [395, 862],
  [418, 855],
  [455, 902],
  [492, 915],
  [520, 948],
  [545, 952],
  [590, 1010],
];

export const BLADE_AT: Pt = [372, 845];

export const floor = (ctx: CanvasRenderingContext2D) => {
  const g = ctx.createLinearGradient(0, ROOM.floor, 0, ROOM.bottom);
  g.addColorStop(0, P.floor.color);
  g.addColorStop(1, '#e6dcef');
  ctx.fillStyle = g;
  ctx.fillRect(ROOM.left, ROOM.floor, ROOM.right - ROOM.left, ROOM.bottom - ROOM.floor);
  ctx.save();
  ctx.strokeStyle = P.wainscot.shade;
  ctx.lineWidth = LINE_SMALL;
  ctx.beginPath();
  ctx.moveTo(ROOM.left, ROOM.floor);
  ctx.lineTo(ROOM.right, ROOM.floor);
  unprobed(ctx, () => ctx.stroke());
  ctx.strokeStyle = '#6f64a2';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  CRACK.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  unprobed(ctx, () => ctx.stroke());
  ctx.restore();
  beams(ctx);
};

const DOCK = { x0: 55, x1: 530, top: 590, foot: 825 } as const;

export const dockShadow = (ctx: CanvasRenderingContext2D) =>
  floorShadow(ctx, thrown(DOCK.x0, DOCK.x1, DOCK.foot, DOCK.foot - DOCK.top), 0.42);

export const dock = (ctx: CanvasRenderingContext2D) => {
  const { x0, x1, top, foot } = DOCK;
  const rail = 640;
  for (let x = 140; x < 470; x += 54) cut(ctx, box(x, rail, 22, 120), P.wood, { line: LINE_SMALL });
  cut(ctx, box(x0 + 40, rail - 20, x1 - x0 - 80, 28), P.woodLight);
  cut(ctx, box(x0 + 40, 760, x1 - x0 - 80, 34), P.wood);
  cut(ctx, box(x0, foot - 34, x1 - x0, 34), P.wood);
  for (const x of [x0, x1 - 64]) {
    cut(ctx, box(x + 6, top + 22, 52, foot - top - 22), P.wood);
    cut(ctx, box(x, top, 64, 30), P.woodLight);
  }
};

const TABLE = { x0: 552, x1: 1025, top: 600, foot: 865 } as const;

export const tableShadow = (ctx: CanvasRenderingContext2D) => {
  floorShadow(ctx, thrown(TABLE.x0 + 20, TABLE.x0 + 50, TABLE.foot, 260), 0.38);
  floorShadow(ctx, thrown(TABLE.x1 - 60, TABLE.x1 - 30, TABLE.foot, 260), 0.38);
  floorShadow(ctx, thrown(TABLE.x0 + 30, TABLE.x1 - 30, TABLE.foot - 40, 200), 0.18);
};

export const table = (ctx: CanvasRenderingContext2D) => {
  const { x0, x1, top, foot } = TABLE;
  for (const x of [x0 + 20, x1 - 60]) cut(ctx, box(x, top + 40, 34, foot - top - 40), P.wood);
  cut(ctx, box(x0, top, x1 - x0, 14), P.woodLight, { line: LINE_SMALL });
  cut(ctx, box(x0, top + 12, x1 - x0, 40), P.wood);
};

export const TABLE_TOP = TABLE.top + 2;
export const STACK: Pt = [650, TABLE.top - 2];

const BENCH = { x0: 975, x1: 1640, top: 375, foot: 825 } as const;

export const benchShadow = (ctx: CanvasRenderingContext2D) =>
  floorShadow(ctx, thrown(BENCH.x0, BENCH.x1, BENCH.foot, 300), 0.3);

export const bench = (ctx: CanvasRenderingContext2D) => {
  const { x0, x1, top, foot } = BENCH;
  cut(ctx, box(x0 + 10, top + 30, x1 - x0 - 10, foot - top - 30), P.bench);
  cut(ctx, box(x0 + 100, top + 80, x1 - x0 - 200, foot - top - 130), P.bench, { line: LINE_SMALL });
  cut(ctx, box(x0, top, x1 - x0, 36), P.benchTop);
};

export const BENCH_TOP = BENCH.top;

const GLOW = { face: '#fec652', bright: '#fdf08a', rim: '#fed45a', floor: '#fff0bf' } as const;

export const benchWarm = (ctx: CanvasRenderingContext2D, amount: number) => {
  if (amount <= 0) return;
  const { x0, x1, foot } = BENCH;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const wash = ctx.createLinearGradient(x0, foot, DOCK.x0, foot + 140);
  wash.addColorStop(0, `${GLOW.floor}66`);
  wash.addColorStop(1, `${GLOW.floor}00`);
  ctx.globalAlpha = Math.min(1, amount);
  ctx.fillStyle = wash;
  trace(ctx, [
    [x0, foot - 10],
    [x1, foot - 10],
    [x1, foot + 260],
    [DOCK.x0, foot + 160],
    [DOCK.x0, foot + 20],
  ]);
  ctx.fill();
  ctx.restore();
};

export const benchLit = (ctx: CanvasRenderingContext2D, amount: number) => {
  if (amount <= 0) return;
  const { x0, x1, top, foot } = BENCH;
  ctx.save();
  ctx.globalAlpha = Math.min(1, amount);
  const mid = (x0 + x1) / 2;
  const face = ctx.createRadialGradient(mid, (top + foot) / 2, 20, mid, (top + foot) / 2, 420);
  face.addColorStop(0, GLOW.bright);
  face.addColorStop(0.45, GLOW.face);
  face.addColorStop(1, `${GLOW.face}d0`);
  ctx.fillStyle = face;
  trace(ctx, box(x0 + 10, top + 30, x1 - x0 - 10, foot - top - 30));
  ctx.fill();
  ctx.fillStyle = GLOW.rim;
  trace(ctx, box(x0, top, x1 - x0, 36));
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = LINE_SMALL;
  ctx.strokeStyle = C.outline;
  trace(ctx, box(x0 + 100, top + 80, x1 - x0 - 200, foot - top - 130));
  unprobed(ctx, () => ctx.stroke());
  ctx.lineWidth = LINE;
  trace(ctx, box(x0, top, x1 - x0, 36));
  unprobed(ctx, () => ctx.stroke());
  trace(ctx, box(x0 + 10, top + 30, x1 - x0 - 10, foot - top - 30));
  unprobed(ctx, () => ctx.stroke());
  ctx.restore();
};

export const BENCH_BEAM = { from: TABLE.x1 + 80, to: TABLE.x0 - 90 } as const;
export const blottedAt = (x: number, amount: number) => {
  const front = lerp(BENCH_BEAM.from, BENCH_BEAM.to, amount);
  return Math.max(0, Math.min(1, (x + 66 - front) / 132));
};

export const chair = (ctx: CanvasRenderingContext2D) => {
  cut(ctx, box(1392, 168, 112, 220), P.wood);
  cut(ctx, box(1406, 182, 84, 200), P.chair, { line: LINE_SMALL });
};

export const BLOCK: Pt = [1066, 372];

export const block = (ctx: CanvasRenderingContext2D) =>
  cut(ctx, box(BLOCK[0] - 34, BLOCK[1] - 6, 68, 12), P.gavel, { line: LINE_SMALL });

export const gavel = (ctx: CanvasRenderingContext2D, grip: Pt, rot: number) => {
  ctx.save();
  ctx.translate(grip[0], grip[1]);
  ctx.rotate(rot);
  cut(ctx, box(-62, -5, 74, 10), P.gavel, { line: LINE_SMALL });
  cut(ctx, box(-82, -20, 34, 40), P.gavel);
  ctx.restore();
};

export const sheet = (
  ctx: CanvasRenderingContext2D,
  at: { readonly x: number; readonly y: number; readonly rot: number },
  seed: number,
  flat = 0.32,
  blotted = 0,
) => {
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(at.rot);
  ctx.scale(1, flat);
  cut(ctx, box(-66, -46, 132, 92), P.sheet, {
    line: LINE_SMALL / flat > 8 ? 3 : LINE_SMALL,
    flat: true,
  });
  const r = rng(seed);
  if (blotted > 0) {
    ctx.beginPath();
    ctx.rect(-80, -60, 146 * (1 - Math.min(1, blotted)), 120);
    ctx.clip();
  }
  ctx.strokeStyle = C.scarlet;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const row of [-18, 12]) {
    ctx.beginPath();
    let x = -46 + r() * 8;
    ctx.moveTo(x, row);
    while (x < 40) {
      x += 9 + r() * 5;
      ctx.lineTo(x, row + (r() < 0.5 ? -12 : 10));
    }
    unprobed(ctx, () => ctx.stroke());
  }
  ctx.restore();
};

export const STACK_SHEETS = (() => {
  const r = rng(2026);
  return Array.from({ length: 9 }, (_, i) => ({
    x: STACK[0] + (r() - 0.5) * 14,
    y: STACK[1] - i * 7,
    rot: (r() - 0.5) * 0.12,
  }));
})();

export const LAID_SHEETS = [
  { x: 790, y: TABLE.top + 6, rot: 0.03 },
  { x: 905, y: TABLE.top + 2, rot: -0.04 },
] as const;

const WIDE = {
  left: 350,
  right: 1760,
  rail: 395,
  foot: 545,
  leftRail: 575,
  leftFoot: 770,
  rightRail: 560,
  rightFoot: 740,
} as const;

const WIDE_WINDOW = { near: 128, far: 302, nearFoot: 412, farFoot: 346, top: -20 } as const;

const leftWall = (x: number, k: number): Pt => {
  const t = x / WIDE.left;
  const rail = lerp(WIDE.leftRail, WIDE.rail, t);
  const foot = lerp(WIDE.leftFoot, WIDE.foot, t);
  return [x, lerp(rail, foot, k)];
};

const widePilaster = (
  ctx: CanvasRenderingContext2D,
  x: number,
  w: number,
  rail: number,
  foot: number,
) => {
  cut(ctx, box(x - w / 2, -20, w, rail + 20), P.column, { line: 0 });
  cut(ctx, box(x - w / 2 - 8, rail - 22, w + 16, 24), P.columnDeep, { line: 0 });
  cut(ctx, box(x - w / 2 - 4, rail, w + 8, foot - rail), P.wainscotRail, { line: 0 });
  ctx.save();
  ctx.strokeStyle = P.column.shade;
  ctx.lineWidth = 4;
  for (const dx of [-0.2, 0.2]) {
    ctx.beginPath();
    ctx.moveTo(x + dx * w, -20);
    ctx.lineTo(x + dx * w, rail - 30);
    unprobed(ctx, () => ctx.stroke());
  }
  ctx.restore();
};

const wideWindow = (ctx: CanvasRenderingContext2D) => {
  const { near, far, nearFoot, farFoot, top } = WIDE_WINDOW;
  cut(
    ctx,
    [
      [near, top],
      [far, top],
      [far, farFoot],
      [near, nearFoot],
    ],
    P.frame,
    { line: 0 },
  );
  const inner: Pt[] = [
    [near + 16, top],
    [far - 14, top],
    [far - 14, farFoot - 18],
    [near + 16, nearFoot - 24],
  ];
  ctx.save();
  trace(ctx, inner);
  ctx.clip();
  const sky = ctx.createLinearGradient(0, top, 0, nearFoot);
  sky.addColorStop(0, '#8fcbe8');
  sky.addColorStop(1, '#e4f3f6');
  ctx.fillStyle = sky;
  ctx.fillRect(near, top, far - near, nearFoot - top);
  ctx.fillStyle = '#f6fbfb';
  ctx.beginPath();
  ctx.ellipse(near + 70, 70, 40, 14, 0, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = '#9fb3dc';
  for (const [bx, bw, bh] of [
    [30, 34, 130],
    [62, 40, 170],
    [110, 30, 110],
  ] as const)
    ctx.fillRect(near + bx, farFoot - bh, bw, bh + 80);
  ctx.fillStyle = '#4f9a8f';
  for (const [cx, ch, cw] of [
    [104, 240, 16],
    [50, 150, 11],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(near + cx, farFoot - ch / 2, cw, ch / 2, 0, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.restore();
  ctx.save();
  ctx.lineWidth = 4;
  ctx.strokeStyle = P.frame.shade;
  trace(ctx, inner);
  unprobed(ctx, () => ctx.stroke());
  ctx.restore();
};

const wideWainscot = (ctx: CanvasRenderingContext2D, a0: Pt, a1: Pt, b1: Pt, b0: Pt) => {
  cut(ctx, [a0, a1, b1, b0], P.wainscot, { flat: true, line: 0 });
  cut(ctx, [a0, a1, [a1[0], a1[1] + 16], [a0[0], a0[1] + 16]], P.wainscotRail, {
    flat: true,
    line: 0,
  });
};

const wideBeams = (ctx: CanvasRenderingContext2D) => {
  ctx.save();
  for (const [x0, w, a] of [
    [60, 70, 0.6],
    [170, 60, 0.5],
    [270, 110, 0.45],
  ] as const) {
    const g = ctx.createLinearGradient(x0, 0, x0 + 900, 1080);
    g.addColorStop(0, `${BEAM}ff`);
    g.addColorStop(1, `${BEAM}00`);
    ctx.globalAlpha = a;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.lineTo(x0 + w, 0);
    ctx.lineTo(x0 + w + 900, 1080);
    ctx.lineTo(x0 + 900, 1080);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
};

const WIDE_CRACK: ReadonlyArray<Pt> = [
  [612, 812],
  [655, 842],
  [700, 860],
  [712, 905],
  [705, 935],
  [745, 975],
  [780, 1020],
  [826, 1080],
];

export const wideRoom = (ctx: CanvasRenderingContext2D) => {
  const { left, right, rail, foot } = WIDE;
  const g = ctx.createLinearGradient(0, foot, 0, 1080);
  g.addColorStop(0, P.floor.color);
  g.addColorStop(1, '#ece2ef');
  ctx.fillStyle = g;
  ctx.fillRect(0, foot - 4, 1920, 1080 - foot + 4);
  ctx.fillStyle = P.wall.color;
  ctx.fillRect(left, -20, right - left, rail + 20);
  wideWainscot(ctx, [left, rail], [right, rail], [right, foot], [left, foot]);
  ctx.save();
  ctx.strokeStyle = P.wainscot.shade;
  ctx.lineWidth = 4;
  for (let x = 600; x < 1360; x += 300)
    unprobed(ctx, () => ctx.strokeRect(x, rail + 38, 250, foot - rail - 66));
  ctx.restore();
  for (const x of [518, 1462]) widePilaster(ctx, x, 110, rail, foot);
  cut(ctx, [[0, -20], [left, -20], leftWall(left, 1), [0, WIDE.leftFoot]], paper('#f7efe0'), {
    flat: true,
    line: 0,
  });
  wideWindow(ctx);
  wideWainscot(ctx, leftWall(0, 0), leftWall(left, 0), leftWall(left, 1), leftWall(0, 1));
  widePilaster(ctx, 72, 96, leftWall(72, 0)[1] - 30, leftWall(72, 1)[1]);
  widePilaster(ctx, 382, 78, rail, foot);
  cut(
    ctx,
    [
      [right, -20],
      [1920, -20],
      [1920, WIDE.rightFoot],
      [right, foot],
    ],
    P.wall,
    { flat: true, line: 0 },
  );
  wideWainscot(ctx, [right, rail], [1920, WIDE.rightRail], [1920, WIDE.rightFoot], [right, foot]);
  widePilaster(ctx, 1815, 110, 490, 700);
  ctx.save();
  ctx.globalAlpha = HAZE.alpha;
  ctx.fillStyle = HAZE.color;
  ctx.fillRect(0, -20, 1920, foot + 240);
  ctx.restore();
  sunGlow(ctx);
  wideBeams(ctx);
  ctx.save();
  ctx.strokeStyle = '#6f64a2';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  WIDE_CRACK.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  unprobed(ctx, () => ctx.stroke());
  ctx.restore();
};

const pew = (ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number) => {
  cut(ctx, box(x0, y, x1 - x0, 1080 - y + 20), P.wood);
  cut(ctx, box(x0 - 4, y - 10, x1 - x0 + 8, 22), P.woodLight, { line: LINE_SMALL });
  for (const x of [x0 - 2, x1 - 34]) cut(ctx, box(x, y - 46, 36, 1080 - y + 66), P.woodLight);
};

export const widePews = (ctx: CanvasRenderingContext2D) => {
  pew(ctx, -40, 162, 900);
  pew(ctx, 1758, 1960, 900);
  pew(ctx, -40, 470, 985);
  pew(ctx, 1440, 1960, 985);
};
