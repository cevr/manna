import { BOIL_FPS, type Hand, type Pt, spline, stroke, sub } from './ink.ts';
import { cutout } from './cutout.ts';
import { PAPER_EDGES, piece } from './piece.ts';
import { probeHand, probesHands } from './probe.ts';
import { clamp, lerp } from '../core/time.ts';
import { hash } from '../core/random.ts';

export type Grip = 'open' | 'hold' | 'point' | 'palm';

export const GRIPS: ReadonlyArray<Grip> = ['open', 'hold', 'point', 'palm'];

export interface Gesture {
  readonly to: Pt;
  readonly reach: number;
  readonly grip?: Grip;
  readonly turn?: number;
  readonly was?: Grip;
  readonly change?: number;
}

export interface HandStyle {
  readonly skin: string;
  readonly outline: string;
  readonly mitten: number;
  readonly line: number;
  readonly radius: number;
}

export interface HandRoot {
  readonly shoulder: Pt;
  readonly rest: Pt;
  readonly away: -1 | 1;
  readonly breath: number;
}

const BREATH_PERIOD = 3.6;
const BOB = 0.08;
const SETTLE = 0.35;
const SETTLE_PEAK = 0.3;
const CUT = { far: -Math.PI / 4, near: (-3 * Math.PI) / 4 } as const;

const buffer = (n: number): [number, number][] =>
  Array.from({ length: n }, (): [number, number] => [0, 0]);

export const breathOf = (hand: Hand): number =>
  Math.sin((2 * Math.PI * hand.boil) / (BOIL_FPS * BREATH_PERIOD) + 2 * Math.PI * hash(hand.seed));

const wrap = (a: number, cut: number) => {
  const turn = 2 * Math.PI;
  return cut + ((((a - cut) % turn) + turn) % turn);
};

interface Placed {
  x: number;
  y: number;
  angle: number;
  s: number;
}
const PLACED: Placed = { x: 0, y: 0, angle: 0, s: 0 };

const place = (root: HandRoot, g: Gesture | undefined, mitten: number): Placed => {
  const [sx, sy] = root.shoulder;
  const cut = root.away === 1 ? CUT.near : CUT.far;
  const rx = root.rest[0] - sx;
  const ry = root.rest[1] - sy;
  const r0 = Math.hypot(rx, ry);
  const a0 = wrap(Math.atan2(ry, rx), cut);
  const s = g === undefined ? 0 : clamp(g.reach);
  PLACED.s = s;
  if (g === undefined || s <= 0) {
    PLACED.x = root.rest[0];
    PLACED.y = root.rest[1] + BOB * mitten * root.breath;
    PLACED.angle = a0;
    return PLACED;
  }
  const tx = g.to[0] - sx;
  const ty = g.to[1] - sy;
  const a1 = wrap(Math.atan2(ty, tx), cut);
  PLACED.angle = lerp(a0, a1, s);
  if (s >= 1) {
    PLACED.x = g.to[0];
    PLACED.y = g.to[1];
    return PLACED;
  }
  const settle = (SETTLE * mitten * Math.sin(Math.PI * s) * s ** 3) / SETTLE_PEAK;
  const r = lerp(r0, Math.hypot(tx, ty), s) + settle;
  PLACED.x = sx + r * Math.cos(PLACED.angle);
  PLACED.y = sy + r * Math.sin(PLACED.angle) + BOB * mitten * root.breath * (1 - s);
  return PLACED;
};

export const handAt = (root: HandRoot, g: Gesture | undefined, style: HandStyle): Pt => {
  const p = place(root, g, style.mitten);
  return [p.x, p.y];
};

const capsule = (a: Pt, b: Pt, r: number): Pt[] => {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const out: Pt[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = ang + Math.PI / 2 + (Math.PI * i) / 8;
    out.push([a[0] + Math.cos(t) * r, a[1] + Math.sin(t) * r]);
  }
  for (let i = 0; i <= 8; i++) {
    const t = ang - Math.PI / 2 + (Math.PI * i) / 8;
    out.push([b[0] + Math.cos(t) * r, b[1] + Math.sin(t) * r]);
  }
  return out;
};

interface Part {
  readonly unit: ReadonlyArray<Pt>;
  readonly at: [number, number][];
}
const part = (unit: ReadonlyArray<Pt>): Part => ({ unit, at: buffer(unit.length) });

const PALM_POINTS = 40;

const radial = (poly: ReadonlyArray<Pt>, n: number): Pt[] =>
  Array.from({ length: n }, (_, k): Pt => {
    const t = (2 * Math.PI * k) / n;
    const dx = Math.cos(t);
    const dy = Math.sin(t);
    let far = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (a === undefined || b === undefined) continue;
      const ex = b[0] - a[0];
      const ey = b[1] - a[1];
      const den = ex * dy - dx * ey;
      if (Math.abs(den) < 1e-12) continue;
      const u = (ex * a[1] - a[0] * ey) / den;
      const v = (dx * a[1] - dy * a[0]) / den;
      if (u > 0 && v >= 0 && v <= 1) far = Math.max(far, u);
    }
    return [far * dx, far * dy];
  });

interface Form {
  readonly palm: ReadonlyArray<Pt>;
  readonly thumb: ReadonlyArray<Pt>;
  readonly finger: ReadonlyArray<Pt>;
  readonly thumbOver: boolean;
}

const FINGER_ROOT: Pt = [0.12, -0.14];
const FINGER_TIP: Pt = [0.8, -0.16];
const NO_FINGER = (): Pt[] => capsule(FINGER_ROOT, FINGER_ROOT, 0);

const FIST: Pt[] = spline(
  [
    [-0.45, -0.28],
    [0, -0.36],
    [0.32, -0.27],
    [0.42, 0],
    [0.32, 0.28],
    [0, 0.36],
    [-0.45, 0.28],
  ],
  5,
  true,
);
const SPREAD: Pt[] = spline(
  [
    [-0.5, -0.3],
    [0, -0.4],
    [0.36, -0.38],
    [0.56, -0.2],
    [0.6, 0.05],
    [0.5, 0.3],
    [0.2, 0.4],
    [-0.2, 0.36],
    [-0.5, 0.3],
  ],
  5,
  true,
);
const SPREAD_THUMB = capsule([-0.12, -0.32], [-0.06, -0.72], 0.13);

const FORMS = {
  open: {
    palm: radial(
      spline(
        [
          [-0.5, -0.26],
          [-0.1, -0.3],
          [0.3, -0.3],
          [0.5, -0.18],
          [0.55, 0.02],
          [0.46, 0.24],
          [0.2, 0.32],
          [-0.2, 0.3],
          [-0.5, 0.24],
        ],
        5,
        true,
      ),
      PALM_POINTS,
    ),
    thumb: capsule([-0.2, -0.2], [0.1, -0.55], 0.12),
    finger: NO_FINGER(),
    thumbOver: false,
  },
  hold: {
    palm: radial(FIST, PALM_POINTS),
    thumb: capsule([-0.18, -0.26], [0.22, -0.28], 0.11),
    finger: NO_FINGER(),
    thumbOver: true,
  },
  point: {
    palm: radial(FIST, PALM_POINTS),
    thumb: capsule([-0.18, -0.26], [0.18, -0.3], 0.11),
    finger: capsule(FINGER_ROOT, FINGER_TIP, 0.11),
    thumbOver: true,
  },
  palm: {
    palm: radial(SPREAD, PALM_POINTS),
    thumb: SPREAD_THUMB,
    finger: NO_FINGER(),
    thumbOver: false,
  },
} satisfies Record<Grip, Form>;

const REST_GRIP: Grip = 'open';
const FORMING: readonly [number, number] = [0.4, 0.9];

const MORPH_UNIT = {
  palm: buffer(PALM_POINTS),
  thumb: buffer(FORMS.open.thumb.length),
  finger: buffer(FORMS.open.finger.length),
};
const MORPH = {
  palm: part(MORPH_UNIT.palm),
  thumb: part(MORPH_UNIT.thumb),
  finger: part(MORPH_UNIT.finger),
};

const blend = (out: [number, number][], a: ReadonlyArray<Pt>, b: ReadonlyArray<Pt>, t: number) => {
  for (let i = 0; i < out.length; i++) {
    const p = a[i];
    const q = b[i];
    const o = out[i];
    if (p === undefined || q === undefined || o === undefined) continue;
    o[0] = lerp(p[0], q[0], t);
    o[1] = lerp(p[1], q[1], t);
  }
};

const formed = (from: Grip, to: Grip, form: number) => {
  const a: Form = FORMS[from];
  const b: Form = FORMS[to];
  blend(MORPH_UNIT.palm, a.palm, b.palm, form);
  blend(MORPH_UNIT.thumb, a.thumb, b.thumb, form);
  blend(MORPH_UNIT.finger, a.finger, b.finger, form);
  return form < 0.5 ? a.thumbOver : b.thumbOver;
};

const changeOf = (g: Gesture | undefined) => (g?.was === undefined ? 1 : clamp(g.change ?? 0));

const arrivedAt = (s: number) => clamp((s - FORMING[0]) / (FORMING[1] - FORMING[0]));

const gripShares = (g: Gesture | undefined): Record<Grip, number> => {
  const grip = g?.grip ?? REST_GRIP;
  const change = changeOf(g);
  const shares = { open: 0, hold: 0, point: 0, palm: 0 };
  shares[g?.was ?? grip] += 1 - change;
  shares[grip] += change;
  return shares;
};

interface Shaped {
  thumbOver: boolean;
  pointing: number;
}
const SHAPED: Shaped = { thumbOver: false, pointing: 0 };

const shaped = (g: Gesture | undefined, s: number): Shaped => {
  const grip = g?.grip ?? REST_GRIP;
  const was = g?.was ?? grip;
  const change = changeOf(g);
  const arrived = arrivedAt(s);
  const working = formed(was, grip, change);
  const rest: Form = FORMS[REST_GRIP];
  blend(MORPH_UNIT.palm, rest.palm, MORPH_UNIT.palm, arrived);
  blend(MORPH_UNIT.thumb, rest.thumb, MORPH_UNIT.thumb, arrived);
  blend(MORPH_UNIT.finger, rest.finger, MORPH_UNIT.finger, arrived);
  SHAPED.thumbOver = arrived < 0.5 ? rest.thumbOver : working;
  SHAPED.pointing =
    arrived * ((was === 'point' ? 1 - change : 0) + (grip === 'point' ? change : 0));
  return SHAPED;
};

export const handShape = (g: Gesture | undefined, s: number): ReadonlyArray<Pt> => {
  shaped(g, s);
  return MORPH_UNIT.palm;
};

const lay = (
  p: Part,
  x: number,
  y: number,
  angle: number,
  size: number,
  flip: number,
  along = 1,
): ReadonlyArray<Pt> => {
  const c = Math.cos(angle) * size;
  const s = Math.sin(angle) * size;
  for (let i = 0; i < p.unit.length; i++) {
    const u = p.unit[i];
    const o = p.at[i];
    if (u === undefined || o === undefined) continue;
    const ux = u[0] * along;
    const uy = u[1] * flip;
    o[0] = x + ux * c - uy * s;
    o[1] = y + ux * s + uy * c;
  }
  return p.at;
};

const mitten = (
  ctx: CanvasRenderingContext2D,
  g: Gesture | undefined,
  s: number,
  [x, y]: Pt,
  angle: number,
  size: number,
  flip: number,
  style: HandStyle,
  hand: Hand,
  along = 1,
) => {
  const { thumbOver, pointing } = shaped(g, s);
  const look = {
    role: 'figure',
    line: style.line,
    color: style.skin,
    outline: style.outline,
  } as const;
  if (!thumbOver) piece(ctx, lay(MORPH.thumb, x, y, angle, size, flip, along), look, sub(hand, 1));
  if (pointing > 0)
    piece(ctx, lay(MORPH.finger, x, y, angle, size, flip, along), look, sub(hand, 3));
  piece(ctx, lay(MORPH.palm, x, y, angle, size, flip, along), look, sub(hand, 2));
  if (thumbOver) piece(ctx, lay(MORPH.thumb, x, y, angle, size, flip, along), look, sub(hand, 1));
};

export const turning = (turn: number): Turned => {
  const t = clamp(turn);
  TURNED.cup = t >= 0.5;
  TURNED.along = TURN_EDGE + (1 - TURN_EDGE) * Math.abs(Math.cos(Math.PI * t));
  return TURNED;
};
interface Turned {
  readonly cup: boolean;
  readonly along: number;
}
const TURN_EDGE = 0.2;
interface TurnedAt {
  cup: boolean;
  along: number;
}
const TURNED: TurnedAt = { cup: false, along: 1 };

const toward = (a: number, b: number) => {
  const d = (((b - a) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI);
  return d - Math.PI;
};

const handEnd = (
  ctx: CanvasRenderingContext2D,
  g: Gesture | undefined,
  s: number,
  end: Pt,
  angle: number,
  size: number,
  flip: -1 | 1,
  style: HandStyle,
  hand: Hand,
) => {
  const turn = clamp(g?.turn ?? 0);
  if (turn <= 0) {
    mitten(ctx, g, s, end, angle, size, flip, style, hand);
    return;
  }
  const { cup, along } = turning(turn);
  const facing = angle + toward(angle, -Math.PI / 2) * turn;
  if (!cup) {
    mitten(ctx, g, s, end, facing, size, flip, style, hand, along);
    return;
  }
  const [m0, m1, m2, m3, m4, m5] = palmUpFrame(end, facing, size, flip, along);
  ctx.save();
  ctx.transform(m0, m1, m2, m3, m4, m5);
  cupped(ctx, CUP_OPEN, style, (style.line * CLOSE_SPAN) / size, 0, hand);
  ctx.restore();
};
const CUP_OPEN = 1;
const FRAME: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];

export const palmUpFrame = (
  end: Pt,
  facing: number,
  size: number,
  flip: -1 | 1,
  along = 1,
): Readonly<typeof FRAME> => {
  const k = size / CLOSE_SPAN;
  const sx = k * along;
  const sy = k * flip;
  const c = Math.cos(facing);
  const s = Math.sin(facing);
  FRAME[0] = -s * sy;
  FRAME[1] = c * sy;
  FRAME[2] = -c * sx;
  FRAME[3] = -s * sx;
  FRAME[4] = end[0];
  FRAME[5] = end[1];
  return FRAME;
};

const AT: [number, number] = [0, 0];

export interface HandBody {
  readonly over: boolean;
  readonly body: () => ReadonlyArray<ReadonlyArray<Pt>>;
}

export const floatingHand = (
  ctx: CanvasRenderingContext2D,
  root: HandRoot,
  g: Gesture | undefined,
  style: HandStyle,
  hand: Hand,
  seen?: HandBody,
) => {
  const p = place(root, g, style.mitten);
  AT[0] = p.x;
  AT[1] = p.y;
  if (seen !== undefined && probesHands(ctx)) {
    const reach = g?.reach ?? 0;
    probeHand(ctx, {
      side: root.away === 1 ? 'near' : 'far',
      shoulder: root.shoulder,
      at: AT,
      to: g === undefined || reach <= 0 ? root.rest : g.to,
      size: style.mitten,
      radius: style.radius,
      reach,
      grip: gripShares(g),
      formed: arrivedAt(p.s),
      over: seen.over,
      body: seen.body,
    });
  }
  if (ctx.globalAlpha <= 0) return;
  handEnd(ctx, g, p.s, AT, p.angle, style.mitten, root.away, style, sub(hand, 3));
};

interface CloseStyle {
  readonly skin: string;
  readonly crease: string;
  readonly outline: string;
}

export const CLOSE_LINE = 4;
const VIEW = (25 * Math.PI) / 180;

const PALM: Pt[] = spline(
  [
    [-122, -126],
    [-40, -134],
    [50, -132],
    [120, -120],
    [148, -60],
    [150, 20],
    [132, 96],
    [80, 140],
    [0, 152],
    [-72, 146],
    [-128, 110],
    [-160, 40],
    [-162, -40],
    [-148, -104],
  ],
  6,
  true,
);

const KNUCKLES = -118;
const FINGER_BALLS: ReadonlyArray<readonly [number, number, number]> = [
  [0, -76, 40],
  [0, 76, 40],
  [90, -42, 72],
  [90, 42, 72],
  [102, 0, 76],
];
const BALLS_AT = buffer(FINGER_BALLS.length);
const HULL_POINTS = 48;
const HULL_N: ReadonlyArray<Pt> = Array.from({ length: HULL_POINTS + 1 }, (_, k): Pt => {
  const a = Math.PI / 2 + (2 * Math.PI * k) / HULL_POINTS;
  return [Math.cos(a), Math.sin(a)];
});
const FINGERS_AT = buffer(HULL_POINTS + 1);
const BEND: readonly [number, number] = [(10 * Math.PI) / 180, (170 * Math.PI) / 180];
const CURL_EASE = 0.8;
const OVER: readonly [number, number] = [(125 * Math.PI) / 180, (145 * Math.PI) / 180];
const CREASES_HIDE: readonly [number, number] = [(85 * Math.PI) / 180, (110 * Math.PI) / 180];
const rise = (along: number, bend: number) => along * Math.cos(bend - VIEW);

const JOINTS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [
    [38, -70],
    [44, -35],
    [46, 0],
    [44, 35],
    [38, 70],
  ],
  [
    [100, -50],
    [105, -25],
    [106, 0],
    [105, 25],
    [100, 50],
  ],
];
const JOINTS_AT = JOINTS.map((j) => buffer(j.length));

const THUMB = {
  root: [
    [-128, 30],
    [-104, 14],
  ],
  length: [122, 112],
  angle: [(-128 * Math.PI) / 180, (-98 * Math.PI) / 180],
  radius: 42,
} as const;
const THUMB_POINTS = 18;
const THUMB_AT = buffer(THUMB_POINTS + 1);

const LIFELINE: Pt[] = spline([
  [-140, -70],
  [-96, -24],
  [-74, 40],
  [-70, 118],
]);

export const CLOSE_SPAN =
  Math.max(...PALM.map((p) => p[1])) -
  (KNUCKLES - Math.max(...FINGER_BALLS.map(([a, , r]) => rise(a, BEND[0]) + r)));

export interface CloseShape {
  readonly palm: ReadonlyArray<Pt>;
  readonly fingers: ReadonlyArray<Pt>;
  readonly creases: ReadonlyArray<ReadonlyArray<Pt>>;
  readonly creaseInk: number;
  readonly thumb: ReadonlyArray<Pt>;
  readonly curl: number;
  readonly over: number;
}

const SHAPE = {
  palm: PALM,
  fingers: FINGERS_AT,
  creases: JOINTS_AT,
  creaseInk: 1,
  thumb: THUMB_AT,
  curl: 0,
  over: 0,
} satisfies CloseShape;

const capsuleInto = (out: [number, number][], a: Pt, b: Pt, r: number) => {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const half = THUMB_POINTS / 2;
  for (let i = 0; i < half; i++) {
    const t = ang + Math.PI / 2 + (Math.PI * i) / (half - 1);
    const p = out[i];
    const q = out[half + i];
    if (p === undefined || q === undefined) continue;
    p[0] = a[0] + Math.cos(t) * r;
    p[1] = a[1] + Math.sin(t) * r;
    q[0] = b[0] + Math.cos(t + Math.PI) * r;
    q[1] = b[1] + Math.sin(t + Math.PI) * r;
  }
  const first = out[0];
  const last = out[THUMB_POINTS];
  if (first !== undefined && last !== undefined) {
    last[0] = first[0];
    last[1] = first[1];
  }
};

const fingers = (bend: number) => {
  for (let i = 0; i < FINGER_BALLS.length; i++) {
    const b = FINGER_BALLS[i];
    const o = BALLS_AT[i];
    if (b === undefined || o === undefined) continue;
    o[0] = b[1];
    o[1] = KNUCKLES - rise(b[0], bend);
  }
  for (let k = 0; k < HULL_N.length; k++) {
    const n = HULL_N[k];
    const o = FINGERS_AT[k];
    if (n === undefined || o === undefined) continue;
    let best = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < FINGER_BALLS.length; i++) {
      const c = BALLS_AT[i];
      const r = FINGER_BALLS[i]?.[2];
      if (c === undefined || r === undefined) continue;
      const reach = c[0] * n[0] + c[1] * n[1] + r;
      if (reach <= best) continue;
      best = reach;
      o[0] = c[0] + r * n[0];
      o[1] = c[1] + r * n[1];
    }
  }
};

export const closeShape = (open: number): CloseShape => {
  const curl = clamp(1 - open) ** CURL_EASE;
  const bend = lerp(BEND[0], BEND[1], curl);
  fingers(bend);
  for (let j = 0; j < JOINTS.length; j++) {
    const u = JOINTS[j];
    const o = JOINTS_AT[j];
    if (u === undefined || o === undefined) continue;
    for (let i = 0; i < u.length; i++) {
      const p = u[i];
      const q = o[i];
      if (p === undefined || q === undefined) continue;
      q[0] = p[1];
      q[1] = KNUCKLES - rise(p[0], bend);
    }
  }
  const rx = lerp(THUMB.root[0][0], THUMB.root[1][0], curl);
  const ry = lerp(THUMB.root[0][1], THUMB.root[1][1], curl);
  const len = lerp(THUMB.length[0], THUMB.length[1], curl);
  const ang = lerp(THUMB.angle[0], THUMB.angle[1], curl);
  capsuleInto(
    THUMB_AT,
    [rx, ry],
    [rx + Math.cos(ang) * len, ry + Math.sin(ang) * len],
    THUMB.radius,
  );
  SHAPE.curl = curl;
  SHAPE.over = clamp((bend - OVER[0]) / (OVER[1] - OVER[0]));
  SHAPE.creaseInk = 1 - clamp((bend - CREASES_HIDE[0]) / (CREASES_HIDE[1] - CREASES_HIDE[0]));
  return SHAPE;
};

interface CupStyle {
  readonly skin: string;
  readonly outline: string;
  readonly crease?: string;
}

const cupped = (
  ctx: CanvasRenderingContext2D,
  open: number,
  style: CupStyle,
  line: number,
  detail: number,
  hand: Hand,
) => {
  const s = closeShape(open);
  const ink = {
    color: style.outline,
    width: 2 * line,
    jitter: 0.7,
    taper: 0,
    pressure: 0.15,
    closed: true,
    boil: 'crawl',
  } as const;
  const paper = {
    color: style.skin,
    torn: PAPER_EDGES.cut.torn,
    rim: 0,
    grain: 0.5,
    boil: 'crawl',
  } as const;
  stroke(ctx, s.thumb, ink, sub(hand, 7));
  stroke(ctx, s.palm, ink, sub(hand, 8));
  stroke(ctx, s.fingers, ink, sub(hand, 9));
  cutout(ctx, s.thumb, { ...paper, shadow: 0.35 }, sub(hand, 2));
  cutout(ctx, s.palm, { ...paper, shadow: 0.35 }, sub(hand, 3));
  const crease = style.crease ?? style.outline;
  if (detail > 0)
    stroke(
      ctx,
      LIFELINE,
      { color: crease, width: line, jitter: 0.4, taper: 0.5, alpha: detail, boil: 'crawl' },
      sub(hand, 4),
    );
  cutout(ctx, s.fingers, { ...paper, shadow: 0.35 * s.over }, sub(hand, 5));
  if (s.over > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(-1e4, KNUCKLES + (FINGER_BALLS[0]?.[2] ?? 0), 2e4, 2e4);
    ctx.clip();
    stroke(ctx, s.fingers, { ...ink, width: line, alpha: s.over }, sub(hand, 6));
    ctx.restore();
  }
  const joints = detail * s.creaseInk;
  if (joints > 0)
    for (let k = 0; k < s.creases.length; k++) {
      const c = s.creases[k];
      if (c === undefined) continue;
      stroke(
        ctx,
        c,
        { color: crease, width: 0.8 * line, jitter: 0.4, taper: 0.5, alpha: joints, boil: 'crawl' },
        sub(hand, 10 + k),
      );
    }
};

interface CloseDraw {
  readonly away?: -1 | 1;
  readonly line?: number;
  readonly detail?: number;
}

export const closeHand = (
  ctx: CanvasRenderingContext2D,
  open: number,
  style: CloseStyle,
  hand: Hand,
  draw: CloseDraw = {},
) => {
  const line = draw.line ?? CLOSE_LINE;
  ctx.save();
  if (draw.away === -1) ctx.scale(-1, 1);
  cupped(ctx, open, style, line, draw.detail ?? 1, hand);
  ctx.restore();
};
