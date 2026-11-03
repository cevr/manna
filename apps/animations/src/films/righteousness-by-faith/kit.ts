import {
  type Gesture,
  type Grip,
  type Hand,
  type HandRoot,
  type PieceStyle,
  type Posed,
  type Pt,
  type StrokeStyle,
  CLOSE_LINE,
  CLOSE_SPAN,
  at,
  breathOf,
  closeHand,
  floatingHand,
  glow,
  handAt,
  piece as paperPiece,
  cutout,
  ground,
  type Hex,
  ellipseShape,
  probeFace,
  probesFaces,
  probesHands,
  mix,
  quad,
  rounded,
  spline,
  stroke,
  sub,
} from '@manna/film/canvas';
import { clamp, lerp } from '@manna/film/core';
import { fonts, palette } from './palette.ts';

export const C = palette;
export const F = fonts;

const BUBBLE: Pt[] = [
  [-80, -48],
  [80, -48],
  [80, 40],
  [-20, 40],
  [-54, 76],
  [-46, 40],
  [-80, 40],
];

type PieceOpts = Omit<PieceStyle, 'color' | 'outline'> & { readonly outline?: string };

export const piece = (
  ctx: CanvasRenderingContext2D,
  shape: ReadonlyArray<Pt>,
  color: string,
  hand: Hand,
  opts: PieceOpts,
) => paperPiece(ctx, shape, { ...opts, color, outline: opts.outline ?? C.outline }, hand);

const BUBBLE_LINES = [0, 1, 2].map((i) =>
  rounded(-6 + (i % 2) * 8, -12 + i * 14, 90 - (i % 2) * 20, 5, 2),
);

export const bubble = (
  ctx: CanvasRenderingContext2D,
  hand: Hand,
  lines: (i: number) => Hand,
  s: { readonly fill: string; readonly ink: string; readonly shadow: number },
) => {
  piece(ctx, BUBBLE, s.fill, hand, { role: 'scenery', kind: 'cut', line: 5, shadow: s.shadow });
  BUBBLE_LINES.forEach((l, i) =>
    piece(ctx, l, s.ink, lines(i), { role: 'scenery', kind: 'ink', line: 0, shadow: 0 }),
  );
};

export const HEART: ReadonlyArray<Pt> = [
  [0, -54],
  [40, -94],
  [96, -60],
  [84, 4],
  [0, 96],
  [-84, 4],
  [-96, -60],
  [-40, -94],
];

export const heart = (
  ctx: CanvasRenderingContext2D,
  hand: (k: string) => Hand,
  fill: string,
  law: boolean,
) => {
  piece(ctx, HEART, fill, hand('heart'), { role: 'scenery', kind: 'cut', line: 5 });
  for (const x of [-24, 24] as const) {
    piece(ctx, rounded(x, 6, 40, 64, 14), C.gold, sub(hand('tablet'), x), {
      role: 'scenery',
      kind: 'cut',
      line: 3.5,
    });
    if (law)
      for (let i = 0; i < 4; i++)
        piece(ctx, rounded(x, -10 + i * 12, 24, 3, 1), C.ink, sub(hand('law'), x * 10 + i), {
          role: 'scenery',
          kind: 'ink',
          line: 0,
          shadow: 0,
        });
  }
};

interface PersonGesture extends Gesture {
  readonly lent?: number;
}

export interface Person {
  body?: Hex;
  shade?: Hex;
  skin?: Hex;
  garment?: 'round' | 'robe';
  tilt?: number;
  nod?: number;
  look?: Pt;
  browL?: number;
  browR?: number;
  browTilt?: number;
  mouth?: number;
  smile?: number;
  eyes?: number;
  onHead?: HeadPiece;
  headHands?: Hands;
  build?: readonly [number, number];
  moustache?: number;
  hair?: string;
  far?: PersonGesture;
  near?: PersonGesture;
  stains?: ReadonlyArray<ReadonlyArray<Pt>>;
  washed?: ReadonlyArray<number>;
  sit?: number;
  ground?: number;
}

const NECK: Pt = [0, -128];
const HEAD: Pt = [0, -165];
const HEAD_RX = 35;
const HEAD_RY = 38;
const HEAD_R: Pt = [HEAD_RX, HEAD_RY];
const SHOULDER: Pt = [17, -111];
const SEAT = 22;

const turbanShape = (rx: number, ry: number): Pt[] =>
  spline(
    [
      [-1.1 * rx, -0.7 * ry],
      [-1.04 * rx, -1.02 * ry],
      [-0.56 * rx, -1.42 * ry],
      [0.56 * rx, -1.42 * ry],
      [1.04 * rx, -1.02 * ry],
      [1.1 * rx, -0.7 * ry],
      [0, -0.66 * ry],
    ],
    8,
    true,
  );

const TURBAN_WRAPS = [
  [-0.82, 0.92],
  [-1.02, 0.8],
  [-1.22, 0.5],
] as const;

export const shifted = (pts: ReadonlyArray<Pt>, dx: number, dy: number): Pt[] => {
  const out: Pt[] = [];
  for (const [x, y] of pts) out.push([dx + x, dy + y]);
  return out;
};

export type HeadPiece = (
  ctx: CanvasRenderingContext2D,
  c: Pt,
  r: Pt,
  hand: Hand,
  hands: Hands | undefined,
) => void;

export const turban: HeadPiece = (ctx, [cx, cy], [rx, ry], hand) => {
  piece(ctx, shifted(turbanShape(rx, ry), cx, cy), C.paper, sub(hand, 5), { role: 'figure' });
  for (const [y, w] of TURBAN_WRAPS)
    stroke(
      ctx,
      quad(
        [cx - w * rx, cy + (y - 0.04) * ry],
        [cx, cy + (y + 0.08) * ry],
        [cx + w * rx, cy + (y + 0.02) * ry],
      ),
      { color: C.paperTone, width: 2, jitter: 0.4, boil: 'crawl' },
      sub(hand, 70 + y),
    );
};

const moustacheSide = (x: number, y: number, side: -1 | 1, m: number): Pt[] => {
  const s = 0.5 + 0.5 * m;
  return spline(
    [
      [x, y - 3],
      [x + side * 9 * s, y - 5],
      [x + side * 17 * s, y - 2],
      [x + side * 23 * s, y + 1 + 4 * m],
      [x + side * 15 * s, y + 3],
      [x + side * 6 * s, y + 4],
      [x, y + 3],
    ],
    5,
    true,
  );
};

const EYE_DX = [-12, 13] as const;
const LEG_X = [-13, 13] as const;
const SIDES = [-1, 1] as const;

const eyePair = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  open: number,
  smile: number,
  hand: Hand,
) => {
  for (const dx of EYE_DX) {
    if (open < 0.3) {
      const bow = smile > 0.5 ? -4 : 4;
      stroke(
        ctx,
        quad([x + dx - 5, y], [x + dx, y + bow], [x + dx + 5, y]),
        { color: C.outline, width: 2.6, jitter: 0.3, taper: 0.2, boil: 'crawl' },
        sub(hand, 11 + dx),
      );
      continue;
    }
    ctx.fillStyle = C.outline;
    ctx.beginPath();
    ctx.ellipse(x + dx, y, 3.2, 4.2 * open, 0, 0, Math.PI * 2);
    ctx.fill();
  }
};

const mouthOf = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  open: number,
  smile: number,
  hand: Hand,
) => {
  if (Math.abs(smile) > 0.05)
    stroke(
      ctx,
      quad([x - 7, y + 14], [x + 2, y + 14 + 8 * smile], [x + 11, y + 14]),
      { color: C.outline, width: 3, jitter: 0.3, taper: 0.3, boil: 'crawl' },
      sub(hand, 10),
    );
  if (open <= 0.02) return;
  const grin = clamp(smile * 3);
  const oh = open * (1 - grin);
  ctx.fillStyle = C.outline;
  if (oh > 0.02) {
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 16, 3 * oh + 0.5, 4 * oh + 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const lip = open * grin;
  if (lip > 0.02) {
    ctx.beginPath();
    ctx.moveTo(x - 7, y + 14);
    ctx.quadraticCurveTo(x + 2, y + 14 + 8 * smile + 10 * lip, x + 11, y + 14);
    ctx.closePath();
    ctx.fill();
  }
};

const frameOf = (ctx: CanvasRenderingContext2D, dy: number, sx = 1, sy = 1) => {
  ctx.save();
  if (dy !== 0) ctx.translate(0, dy);
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
};

const SHIN = 46;
const KNEE_Y = 6;

const legs = (ctx: CanvasRenderingContext2D, sit: number, shade: string, hand: Hand) => {
  for (const x of LEG_X) {
    const k = sub(hand, 1 + x);
    if (sit <= 0) {
      piece(ctx, rounded(x, -10, 16, 22, 5), shade, k, { role: 'figure', line: 2.5 });
      continue;
    }
    const lx = x * (1 + 0.35 * sit);
    const top = lerp(-21, KNEE_Y, sit);
    const heel = lerp(1, KNEE_Y + SHIN, sit);
    piece(ctx, rounded(lx, (top + heel) / 2, 15, heel - top, 5), shade, k, {
      role: 'figure',
      line: 2.5,
    });
    piece(
      ctx,
      ellipseShape(lx + Math.sign(x) * 4 * sit, heel - 1, 8 + 3 * sit, 6, 24),
      shade,
      sub(k, 40),
      { role: 'figure', line: 2.5 },
    );
  }
};

const ROBE_SHAPE = spline(
  [
    [-24, -126],
    [24, -126],
    [44, -60],
    [52, -2],
    [-52, -2],
    [-44, -60],
  ],
  6,
  true,
);
const TUNIC_SHAPE = rounded(0, -72, 66, 112, 22);
const ROBE_SPAN = [-126, -2] as const;
const TUNIC_SPAN = [-128, -16] as const;
const SEAT_HEM = 3;
const LAP = spline(
  [
    [-46, -14],
    [0, -11],
    [46, -14],
    [52, 2],
    [38, 14],
    [20, 13],
    [0, 7],
    [-20, 13],
    [-38, 14],
    [-52, 2],
  ],
  6,
  true,
);
const LAP_CREASE: Pt[] = [
  [1, -4],
  [0, 7],
];
const LAP_FOLD: StrokeStyle = {
  color: C.outline,
  width: 2,
  jitter: 0.4,
  taper: 0.4,
  alpha: 0.5,
  boil: 'crawl',
};
const UNBUILT = [1, 1] as const;
const BUILD_MIN = 0.6;
const BUILD_MAX = 1.5;

const buildOf = (p: Person): readonly [number, number] =>
  p.build === undefined
    ? UNBUILT
    : [clamp(p.build[0], BUILD_MIN, BUILD_MAX), clamp(p.build[1], BUILD_MIN, BUILD_MAX)];
const HEAD_STILL: Pt = [0, 0];
const NO_STAINS: ReadonlyArray<ReadonlyArray<Pt>> = [];

const foldOf = (robe: boolean, sit: number): readonly [dy: number, sx: number, sy: number] => {
  const [top, hem] = robe ? ROBE_SPAN : TUNIC_SPAN;
  const k = (lerp(hem, SEAT_HEM, sit) - top - SEAT * sit) / (hem - top);
  return [top + SEAT * sit - top * k, 1 - 0.18 * sit, k];
};

const onGarment = (p: Person, y: number): readonly [sx: number, y: number] => {
  const [bw, bh] = buildOf(p);
  const sit = clamp(p.sit ?? 0);
  if (sit <= 0) return [bw, bh * y];
  const [dy, sx, sy] = foldOf(p.garment === 'robe', sit);
  return [bw * sx, bh * (dy + sy * y)];
};

const toFold = (ctx: CanvasRenderingContext2D, robe: boolean, sit: number) => {
  if (sit <= 0) return;
  const [dy, sx, sy] = foldOf(robe, sit);
  ctx.translate(0, dy);
  ctx.scale(sx, sy);
};

export const tracePath = (ctx: CanvasRenderingContext2D, pts: ReadonlyArray<Pt>) => {
  let first = true;
  for (const [x, y] of pts) {
    if (first) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    first = false;
  }
  ctx.closePath();
};

export const clipToGarment = (ctx: CanvasRenderingContext2D, p: Person) => {
  const m = ctx.getTransform();
  const [bw, bh] = buildOf(p);
  const sit = clamp(p.sit ?? 0);
  const robe = p.garment === 'robe';
  if (bw !== 1 || bh !== 1) ctx.scale(bw, bh);
  ctx.beginPath();
  if (sit > 0) {
    const lap = ctx.getTransform();
    ctx.scale(robe ? 1 : 0.8, sit);
    tracePath(ctx, LAP);
    ctx.setTransform(lap);
  }
  toFold(ctx, robe, sit);
  tracePath(ctx, robe ? ROBE_SHAPE : TUNIC_SHAPE);
  ctx.clip();
  ctx.setTransform(m);
};

const garment = (ctx: CanvasRenderingContext2D, p: Person, sit: number, body: Hex, hand: Hand) => {
  const robe = p.garment === 'robe';
  ctx.save();
  toFold(ctx, robe, sit);
  piece(ctx, robe ? ROBE_SHAPE : TUNIC_SHAPE, body, sub(hand, 3), { role: 'figure' });
  let i = 0;
  for (const stain of p.stains ?? NO_STAINS) {
    const wash = p.washed?.[i] ?? 0;
    if (wash < 1)
      cutout(
        ctx,
        stain,
        {
          color: wash > 0 ? mix(C.scarlet, body, wash) : C.scarlet,
          torn: 2.5,
          rim: 0,
          shadow: 0.1,
          boil: 'crawl',
        },
        sub(hand, 60 + i),
      );
    i++;
  }
  ctx.restore();
  if (sit <= 0) return;
  ctx.save();
  ctx.scale(robe ? 1 : 0.8, sit);
  piece(ctx, LAP, body, sub(hand, 6), { role: 'figure', shadow: 0.25 });
  stroke(ctx, LAP_CREASE, LAP_FOLD, sub(hand, 14));
  ctx.restore();
};

const PERSON_HAND = { mitten: 22, line: 2.5, radius: 120 } as const;
interface ScratchStyle {
  skin: string;
  outline: string;
  mitten: number;
  line: number;
  radius: number;
}
const HAND_STYLE: ScratchStyle = {
  skin: C.figure,
  outline: C.outline,
  mitten: PERSON_HAND.mitten,
  line: PERSON_HAND.line,
  radius: PERSON_HAND.radius,
};
const REST = { round: [42, -50], robe: [54, -50] } as const satisfies Record<string, Pt>;
const LAP_REST = { x: 0.62, y: -4 } as const;
const LAP_HALF = 46;
const AWAY = { far: -1, near: 1 } as const;

const ROOT_SHOULDER: [number, number] = [0, 0];
const ROOT_REST: [number, number] = [0, 0];
interface ScratchRoot {
  readonly shoulder: Pt;
  readonly rest: Pt;
  away: -1 | 1;
  breath: number;
}
const ROOT: ScratchRoot = { shoulder: ROOT_SHOULDER, rest: ROOT_REST, away: 1, breath: 0 };
const rootOf = (p: Person, side: 'far' | 'near', hand: Hand): HandRoot => {
  const [bw, bh] = buildOf(p);
  const sit = clamp(p.sit ?? 0);
  const away = AWAY[side];
  const robe = p.garment === 'robe';
  const [rx, ry] = REST[robe ? 'robe' : 'round'];
  const lap = LAP_REST.x * LAP_HALF * (robe ? 1 : 0.8);
  ROOT_SHOULDER[0] = away * SHOULDER[0] * bw;
  ROOT_SHOULDER[1] = SHOULDER[1] * bh;
  ROOT_REST[0] = away * lerp(rx, lap, sit) * bw;
  ROOT_REST[1] = lerp(ry, LAP_REST.y - SEAT * sit, sit) * bh;
  ROOT.away = away;
  ROOT.breath = breathOf(hand);
  return ROOT;
};

const reachOf = ([bw, bh]: readonly [number, number]) => PERSON_HAND.radius * Math.max(bw, bh);

const inFront = ([x, y]: Pt, [bw, bh]: readonly [number, number]) =>
  Math.abs(x) < 26 * bw && y > -126 * bh && y < -8 * bh;

const farOver = (g: Gesture | undefined, build: readonly [number, number]) =>
  g !== undefined && g.reach > 0 && inFront(g.to, build);

const personHand = (
  ctx: CanvasRenderingContext2D,
  p: Person,
  side: 'far' | 'near',
  build: readonly [number, number],
  hand: Hand,
  over: boolean,
  sit: number,
  drop: number,
) => {
  const g = p[side];
  HAND_STYLE.radius = reachOf(build);
  HAND_STYLE.mitten = PERSON_HAND.mitten;
  const probed = probesHands(ctx);
  const kept = keptOf(g);
  if (kept <= 0 && !probed) return;
  ctx.save();
  ctx.globalAlpha *= kept;
  floatingHand(
    ctx,
    rootOf(p, side, hand),
    g,
    HAND_STYLE,
    sub(hand, side === 'near' ? 50 : 40),
    probed ? { over, body: () => bodyOf(p, sit, drop) } : undefined,
  );
  ctx.restore();
};

const keptOf = (g: PersonGesture | undefined) => 1 - clamp(PUSH_TAKES * (g?.lent ?? 0));

export const handOf = (p: Person, side: 'far' | 'near', hand: Hand): Pt => {
  const [, bh] = buildOf(p);
  const [x, y] = handAt(rootOf(p, side, hand), p[side], HAND_STYLE);
  return [x, y + SEAT * clamp(p.sit ?? 0) * bh];
};

const FOOT_SHADOW_W = { robe: 150, round: 100 } as const;
const FOOT_SHADOW_Y = 2;

export const person = (ctx: CanvasRenderingContext2D, p: Person, hand: Hand) => {
  const colours = [p.body ?? C.figure, p.skin ?? C.figure] as const;
  const build = buildOf(p);
  const [bw, bh] = build;
  const sit = clamp(p.sit ?? 0);
  const drop = sit > 0 ? SEAT * sit * bh : 0;

  const standing = clamp(p.ground ?? 1) * (1 - sit);
  if (standing > 0) {
    ctx.save();
    ctx.globalAlpha *= standing;
    ground(ctx, 0, FOOT_SHADOW_Y, FOOT_SHADOW_W[p.garment ?? 'round'] * bw);
    ctx.restore();
  }

  HAND_STYLE.skin = colours[1];
  const farFront = farOver(p.far, build);
  if (!farFront) {
    frameOf(ctx, drop);
    personHand(ctx, p, 'far', build, hand, false, sit, drop);
    ctx.restore();
  }
  frameOf(ctx, 0, bw, bh);
  legs(ctx, sit, p.shade ?? C.figureShade, hand);
  ctx.restore();
  frameOf(ctx, 0, bw, bh);
  garment(ctx, p, sit, colours[0], hand);
  ctx.restore();
  frameOf(ctx, drop);
  if (farFront) personHand(ctx, p, 'far', build, hand, true, sit, drop);
  head(ctx, p, colours[1], hand, NECK[1] * (bh - 1));
  personHand(ctx, p, 'near', build, hand, true, sit, drop);
  if (probesFaces(ctx)) {
    headFrame(ctx, p, NECK[1] * (bh - 1));
    probeFace(ctx, HEAD[0], HEAD[1], 2 * HEAD_RY);
    ctx.restore();
  }
  ctx.restore();
};

const bodyOf = (p: Person, sit: number, drop: number): ReadonlyArray<ReadonlyArray<Pt>> => {
  const [bw, bh] = buildOf(p);
  const robe = p.garment === 'robe';
  const [dy, sx, sy] = sit > 0 ? foldOf(robe, sit) : ([0, 1, 1] as const);
  const garment = (robe ? ROBE_SHAPE : TUNIC_SHAPE).map(([x, y]): Pt => [
    bw * sx * x,
    bh * (dy + sy * y) - drop,
  ]);
  const lift = NECK[1] * (bh - 1) + (p.nod ?? 0);
  return [garment, ellipseShape(HEAD[0], HEAD[1] + lift, HEAD_RX, HEAD_RY)];
};

const browOf = (
  ctx: CanvasRenderingContext2D,
  [cx, cy]: Pt,
  side: -1 | 1,
  rise: number,
  tilt: number,
  hand: Hand,
) => {
  const bx = cx + side * 13;
  const by = cy - 21 - rise;
  stroke(
    ctx,
    [
      [bx - 8, by - side * tilt * 6],
      [bx + 8, by + side * tilt * 6],
    ],
    { color: C.outline, width: 3.4, jitter: 0.3, taper: 0.2, boil: 'crawl' },
    hand,
  );
};

const headFrame = (ctx: CanvasRenderingContext2D, p: Person, lift: number) => {
  ctx.save();
  ctx.translate(NECK[0], NECK[1] + (p.nod ?? 0) + lift);
  ctx.rotate(p.tilt ?? 0);
  ctx.translate(-NECK[0], -NECK[1]);
};

const head = (ctx: CanvasRenderingContext2D, p: Person, skin: string, hand: Hand, lift: number) => {
  headFrame(ctx, p, lift);
  const [cx, cy] = HEAD;
  piece(ctx, ellipseShape(cx, cy, HEAD_RX, HEAD_RY), skin, sub(hand, 4), { role: 'figure' });
  const [lx, ly] = p.look ?? HEAD_STILL;
  const smile = clamp(p.smile ?? 0, -1, 1);
  eyePair(ctx, cx + lx, cy - 7 + ly, clamp(p.eyes ?? 1), smile, hand);
  p.onHead?.(ctx, HEAD, HEAD_R, hand, p.headHands);
  const tilt = p.browTilt ?? 0;
  browOf(ctx, HEAD, -1, p.browL ?? 0, tilt, sub(hand, 8));
  browOf(ctx, HEAD, 1, p.browR ?? 0, tilt, sub(hand, 9));
  mouthOf(ctx, cx, cy, p.mouth ?? 0, smile, hand);
  const m = clamp(p.moustache ?? 0);
  if (m > 0)
    for (const side of SIDES)
      piece(
        ctx,
        moustacheSide(cx + 2, cy + 10, side, m),
        p.hair ?? C.outline,
        sub(hand, 12 + side),
        {
          role: 'figure',
          line: 2,
          shadow: 0,
        },
      );
  ctx.restore();
};

export interface GestureAt extends PersonGesture {
  readonly to: [number, number];
  reach: number;
  grip?: Grip;
  turn?: number;
  lent?: number;
}

export type Hands = (k: string) => Hand;

export const christ = (ctx: CanvasRenderingContext2D, pose: Person, hand: Hands) => {
  const robed: Person = { ...pose, body: C.robe, shade: C.robe, garment: 'robe' };
  person(ctx, robed, hand('christ'));
  const [sx, y] = onGarment(robed, -90);
  ctx.save();
  ctx.translate(0, y);
  ctx.rotate(-0.45);
  ctx.scale(sx, 1);
  piece(ctx, SASH, C.gold, hand('sash'), { role: 'figure', line: 2 });
  ctx.restore();
};
const SASH = rounded(0, 0, 92, 12, 3);

export const ROBE: Pt[] = [
  [-120, -330],
  [120, -330],
  [330, -210],
  [330, -80],
  [200, -110],
  [240, 330],
  [-240, 330],
  [-200, -110],
  [-330, -80],
  [-330, -210],
];

export const CHEST: Pt = [0, -80];

export const ICON_X = [-440, 0, 440] as const;

export type Three = readonly [number, number, number];
const EVERY: Three = [1, 1, 1];

export interface IconCount {
  readonly lead: Three;
  readonly dim: number;
}
export const ICON_LEAD = 0.55;
const ICON_DIM = 0.62;
const NO_COUNT: IconCount = { lead: [0, 0, 0], dim: 0 };

interface IconScratch {
  readonly lit: [number, number, number];
  readonly lead: [number, number, number];
  readonly count: Posed<IconCount>;
}

export const iconScratch = (lit: Three = [0, 0, 0], from: IconCount = NO_COUNT): IconScratch => {
  const lead: [number, number, number] = [from.lead[0], from.lead[1], from.lead[2]];
  return { lit: [lit[0], lit[1], lit[2]], lead, count: { lead, dim: from.dim } };
};

export const icons = (
  ctx: CanvasRenderingContext2D,
  hand: Hands,
  lit: Three,
  shown: Three = EVERY,
  count: IconCount = NO_COUNT,
) => {
  const disc = (i: 0 | 1 | 2) => {
    if (shown[i] <= 0) return;
    const lead = Math.max(0, count.lead[i]);
    const fade = count.dim * ICON_DIM * clamp(1 - Math.max(lead, lit[i] / ICON_KEPT));
    ctx.save();
    ctx.globalAlpha *= 1 - fade;
    at(ctx, { x: ICON_X[i], y: 0, scale: shown[i] * (1 + ICON_LEAD * lead) }, () => {
      if (lead > 0) {
        const on = Math.min(1, lead);
        glow(ctx, 0, 0, 360, C.gold, 0.6 * on);
        piece(ctx, ellipseShape(0, 0, 172, 172), C.gold, hand(RIM_KEYS[i]), {
          role: 'scenery',
          kind: 'cut',
          line: 4,
          alpha: on,
        });
      }
      piece(ctx, ellipseShape(0, 0, 150, 150), C.paper, hand(DISC_KEYS[i]), {
        role: 'scenery',
        kind: 'cut',
        line: 6,
      });
      if (lit[i] > 0) glow(ctx, 0, 0, 260, C.glow, lit[i]);
      INNER[i]?.(ctx, hand);
    });
    ctx.restore();
  };
  for (const i of ORDER) if (count.lead[i] <= 0) disc(i);
  for (const i of ORDER) if (count.lead[i] > 0) disc(i);
};
const ORDER = [0, 1, 2] as const;
const DISC_KEYS = ['iconWord', 'iconRobe', 'iconHeart'] as const;
const RIM_KEYS = ['iconWordRim', 'iconRobeRim', 'iconHeartRim'] as const;
const INNER: ReadonlyArray<(ctx: CanvasRenderingContext2D, hand: Hands) => void> = [
  (ctx, hand) =>
    bubble(ctx, hand('bubble'), (i) => sub(hand('lines'), i), {
      fill: C.gold,
      ink: C.ink,
      shadow: 0.35,
    }),
  (ctx, hand) =>
    at(ctx, { x: 0, y: 10, scale: 0.26 }, () =>
      piece(ctx, ROBE, C.robe, hand('iconRobeShape'), { role: 'scenery', kind: 'cut', line: 18 }),
    ),
  (ctx, hand) => heart(ctx, hand, C.cutLight, false),
];

export const ICON_ROW = { x: 960, y: 540, scale: 1, close: 2.3 } as const;
export const ICON_SKY = [
  [0, C.glow],
  [1, C.peachLow],
] as const;
export const ICON_KEPT = 0.7;

const CLOSE_UP = { skin: C.figure, crease: C.figureShade, outline: C.outline } as const;
interface ScratchCloseDraw {
  away: -1 | 1;
  line?: number;
  detail?: number;
}
const CLOSE_DRAW: ScratchCloseDraw = { away: 1 };

export const handCloseUp = (
  ctx: CanvasRenderingContext2D,
  hand: Hands,
  open = 1,
  side: 'far' | 'near' = 'near',
  draw: { readonly line?: number; readonly detail?: number } = {},
) => {
  CLOSE_DRAW.away = AWAY[side];
  CLOSE_DRAW.line = draw.line;
  CLOSE_DRAW.detail = draw.detail;
  closeHand(ctx, open, CLOSE_UP, hand('closeHand'), CLOSE_DRAW);
};

const atMitten = (figureScale: number) => (figureScale * PERSON_HAND.mitten) / CLOSE_SPAN;

export const pushZoom = (figureScale: number, scale: number) => scale / atMitten(figureScale);

export interface HandPush {
  readonly from: Pt;
  readonly figureScale: number;
  readonly to: Pt;
  readonly scale: number;
}

export const pushedHand = (
  ctx: CanvasRenderingContext2D,
  hand: Hands,
  push: HandPush,
  into: number,
  open: number,
  side: 'far' | 'near',
  holds: { readonly under?: () => void; readonly over?: () => void } = {},
) => {
  if (into <= 0) return;
  const start = atMitten(push.figureScale);
  const scale = start * (push.scale / start) ** into;
  const px = lerp(PERSON_HAND.line * push.figureScale, CLOSE_LINE * push.scale, into);
  ctx.save();
  ctx.globalAlpha *= clamp(PUSH_TAKES * into);
  at(
    ctx,
    {
      x: lerp(push.from[0], push.to[0], into),
      y: lerp(push.from[1], push.to[1], into),
      scale,
    },
    () => {
      holds.under?.();
      handCloseUp(ctx, hand, open, side, into < 1 ? { line: px / scale, detail: into } : {});
      holds.over?.();
    },
  );
  ctx.restore();
};
const PUSH_TAKES = 4;
