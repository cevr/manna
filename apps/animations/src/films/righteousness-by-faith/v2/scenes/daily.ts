import {
  type Frame,
  type Pt,
  drawing,
  ellipseShape,
  spline,
  stroke,
  sub,
  glow,
  type Hex,
  mix,
  rounded,
  sky,
} from '@manna/film/canvas';
import { clamp, lerp } from '@manna/film/core';
import { FIGURE_STAINS } from '../../court.ts';
import { PATH_AHEAD, PATH_HILL, alongPath, restingField } from '../../garden.ts';
import {
  type GestureAt,
  C,
  CHEST,
  type Person,
  icons,
  type HandPush,
  person,
  pushedHand,
  piece,
} from '../../kit.ts';

const FIG_SCALE = 2.3;
const OTHER_DX = 380;
const OTHER_SCALE = 1.5;

const THROUGH_ZOOM = 9;

const PILLAR = rounded(0, -260, 96, 520, 10);
const PILLAR_X = [-200, 200] as const;
const ARCH = spline(
  [
    [-250, -500],
    [-200, -640],
    [0, -720],
    [200, -640],
    [250, -500],
    [250, -470],
    [-250, -470],
  ],
  8,
  true,
);
const OPENING = rounded(0, -240, 300, 480, 12);
const WALL_L = rounded(-420, -200, 340, 400, 6);
const WALL_R = rounded(420, -200, 340, 400, 6);

const NOTES = 8;
const NOTE_HEAD = ellipseShape(0, 0, 15, 11, 20);
const NOTE_STEM: Pt[] = [
  [13, -2],
  [13, -54],
];
const NOTE_FLAG: Pt[] = [
  [13, -54],
  [30, -40],
  [26, -24],
];
const NOTE_RATE = 0.22;

const PAPER_SKY = [
  [0, C.paper],
  [1, C.paper],
] as const;

const WIN_HW = 320;
const WIN_HH = 300;
const WIN_FRAME = [
  rounded(0, -WIN_HH - 20, WIN_HW * 2 + 80, 44, 6),
  rounded(0, WIN_HH + 20, WIN_HW * 2 + 80, 44, 6),
  rounded(-WIN_HW - 20, 0, 44, WIN_HH * 2 + 80, 6),
  rounded(WIN_HW + 20, 0, 44, WIN_HH * 2 + 80, 6),
] as const;
const WIN_BAR_V = rounded(0, 0, 22, WIN_HH * 2, 4);
const WIN_BAR_H = rounded(0, 0, WIN_HW * 2, 22, 4);
const SILL = rounded(0, WIN_HH + 40, WIN_HW * 2 + 120, 30, 6);
const HORIZON = 150;
const SUN_ARC = 300;
const VIEW_SCALE = 0.75;
const VIEW_DROP = 110;
const FLOWER_STEM: Pt[] = [
  [0, 0],
  [0, -30],
];
const FLOWER_HEAD = ellipseShape(0, -34, 14, 14, 16);

const AT_WINDOW: Pt = [1420, 1250];
const WINDOW_SCALE = 4.7;
const OPEN_AT: Pt = [-70, -118];
const HAND_AT: Pt = [880, 860];
const HAND_SCALE = 1.3;
const FORWARD: HandPush = {
  from: [AT_WINDOW[0] + OPEN_AT[0] * WINDOW_SCALE, AT_WINDOW[1] + OPEN_AT[1] * WINDOW_SCALE],
  figureScale: WINDOW_SCALE,
  to: HAND_AT,
  scale: HAND_SCALE,
};
const ICONS_IN_HAND = 0.24;

const DAYS = 6;

const ROBED: Person = { body: C.robe, shade: C.robe, garment: 'robe' };

const knobs = {
  gate: [1420, 930],
  window: [620, 440],
  fig: [560, 930],
  onFig: [640, 650],
  onFigZoom: 1.45,
  onGate: [1460, 600],
  onGateZoom: 1.25,
} as const;

const timeline = {
  ask: { at: 'speech', dur: 0.4 },
  lead: { mark: 'joy', dur: 0.4 },
  toGate: { mark: 'joy', offset: -0.2, dur: 1, ease: 'inOutCubic' },
  notes: { mark: 'joy', offset: 0.3, dur: 0.8 },
  other: { mark: 'joy', offset: -0.2, dur: 0.5, ease: 'outBack' },
  ears: { mark: 'joy', offset: 0.5, dur: 0.7, ease: 'inOutSine' },
  toFig: { mark: 'keep', offset: -0.4, dur: 0.9, ease: 'inOutCubic' },
  askAgain: { mark: 'keep', dur: 0.4 },
  through: { mark: 'will', offset: -0.35, dur: 0.6, ease: 'inCubic' },
  roomIn: { after: 'through', dur: 0.16, ends: true, ease: 'linear' },
  dawn: { mark: 'will', until: 'matter', ease: 'outQuad' },
  reach: { mark: 'choose', offset: -0.7, dur: 0.6 },
  palmUp: { mark: 'choose', offset: -0.4, dur: 0.3, ease: 'inOutSine' },
  handUp: { mark: 'choose', dur: 0.7, ease: 'inOutCubic' },
  handBack: { mark: 'sab', dur: 0.6, ease: 'inOutCubic' },
  lay: { mark: 'choose', offset: 0.6, dur: 1.2, ease: 'outBack', stagger: 0.6 },
  days: { mark: 'matter', until: 'sab', ease: 'linear', stagger: 0.8 },
  sixth: { mark: 'sab', dur: 1.3, ease: 'inOutSine' },
  field: { after: 'sixth', offset: -0.2, dur: 0.6 },
  settle: { after: 'field', dur: 2.5, ease: 'outCubic' },
  rest: { mark: 'rest', dur: 1.5 },
} as const;

type DailyFrame = Frame<keyof typeof timeline & string, typeof knobs>;

export const daily = drawing({
  timeline,
  knobs,
  draw: (f) => {
    const through = f.at('through');
    const field = f.at('field');
    const roomIn = f.at('roomIn');
    if (through < 1) page(f, through);
    if (roomIn > 0 && field < 1) room(f, roomIn);
    if (field > 0) sabbath(f, field);
  },
});

const LOOK: [number, number] = [0, 0];
const AT: [number, number] = [0, 0];
const OTHER_LOOK: [number, number] = [0, 0];
const ASKING: Person = { ...ROBED, look: LOOK };
const OVER_EAR_L: GestureAt = { to: [-40, -160], reach: 0, grip: 'open' };
const OVER_EAR_R: GestureAt = { to: [40, -160], reach: 0, grip: 'open' };
const OTHER: Person = {
  look: OTHER_LOOK,
  far: OVER_EAR_L,
  near: OVER_EAR_R,
  stains: FIGURE_STAINS,
};
const OPENED: GestureAt = {
  to: [OPEN_AT[0], OPEN_AT[1]],
  reach: 0,
  grip: 'palm',
  turn: 0,
  lent: 0,
};
const AT_THE_WINDOW: Person = {
  ...ROBED,
  far: OPENED,
  tilt: -0.06,
  look: [-3, -1],
  browL: 1.5,
  browR: 1.5,
  browTilt: 0.1,
  smile: 0.5,
};
const LAID: [number, number, number] = [0, 0, 0];
const LIT: [number, number, number] = [0, 0, 0];
const SKY_TOP: [number, Hex] = [0, C.tealTop];
const SKY_LOW: [number, Hex] = [1, C.tealLow];
const WINDOW_SKY = [SKY_TOP, SKY_LOW] as const;

const page = (f: DailyFrame, through: number) => {
  const { ctx, w, h } = f;
  sky(ctx, w, h, PAPER_SKY);
  const toGate = f.at('toGate') * (1 - f.at('toFig'));
  const FIG = f.knob('fig');
  const [fx, fy] = f.knob('onFig');
  const [gx, gy] = f.knob('onGate');
  const chestY = FIG[1] + CHEST[1] * FIG_SCALE;
  const push = through;
  const x = lerp(lerp(fx, gx, toGate), FIG[0], push);
  const y = lerp(lerp(fy, gy, toGate), chestY, push);
  const zoom = lerp(lerp(f.knob('onFigZoom'), f.knob('onGateZoom'), toGate), THROUGH_ZOOM, push);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-x, -y);
  gate(f);
  other(f);
  robedOnPage(f, toGate);
  ctx.restore();
};

const gate = (f: DailyFrame) => {
  const { ctx, t } = f;
  const { hand } = f;
  const [gx, gy] = f.knob('gate');
  ctx.save();
  ctx.translate(gx, gy);
  glow(ctx, 0, -300, 620, C.glow, 0.9);
  piece(ctx, WALL_L, C.boardLight, hand('wallL'), { role: 'scenery', kind: 'cut', line: 3 });
  piece(ctx, WALL_R, C.boardLight, hand('wallR'), { role: 'scenery', kind: 'cut', line: 3 });
  piece(ctx, OPENING, C.cream, hand('opening'), {
    role: 'scenery',
    kind: 'cut',
    line: 3,
    shadow: 0,
  });
  glow(ctx, 0, -260, 260, C.glow, 1);
  for (const px of PILLAR_X) {
    ctx.save();
    ctx.translate(px, 0);
    piece(ctx, PILLAR, C.gold, sub(hand('pillar'), px), {
      role: 'scenery',
      kind: 'cut',
      line: 4,
    });
    ctx.restore();
  }
  piece(ctx, ARCH, C.gold, hand('arch'), { role: 'scenery', kind: 'cut', line: 4 });
  const notes = f.at('notes');
  const jangle = f.at('ears') * (1 - f.at('toFig'));
  if (notes > 0)
    for (let i = 0; i < NOTES; i++) {
      const drift = (t * NOTE_RATE + i / NOTES) % 1;
      const side = i % 2 === 0 ? -1 : 1;
      const shake = side > 0 ? jangle : 0;
      const nx = side * (40 + 360 * drift) + shake * 10 * Math.sin(t * 31 + i);
      const ny = -300 - 220 * drift + 18 * Math.sin(t * 2 + i) + shake * 8 * Math.cos(t * 27 + i);
      ctx.save();
      ctx.globalAlpha *= notes * Math.sin(Math.PI * drift);
      ctx.translate(nx, ny);
      ctx.rotate(0.15 * Math.sin(t * 1.5 + i) + shake * 0.6 * Math.sin(t * 23 + i * 1.7));
      piece(ctx, NOTE_HEAD, C.gold, sub(hand('note'), i), {
        role: 'scenery',
        kind: 'cut',
        line: 2.5,
        shadow: 0.1,
      });
      stroke(ctx, NOTE_STEM, { color: C.ink, width: 3, jitter: 0.3 }, sub(hand('stem'), i));
      if (i % 3 !== 0)
        stroke(ctx, NOTE_FLAG, { color: C.ink, width: 3, jitter: 0.3 }, sub(hand('flag'), i));
      ctx.restore();
    }
  ctx.restore();
};

const other = (f: DailyFrame) => {
  const { ctx } = f;
  const pop = f.at('other');
  if (pop <= 0) return;
  const ears = f.at('ears');
  const [gx, gy] = f.knob('gate');
  const x = gx + OTHER_DX;
  ctx.save();
  ctx.translate(x, gy);
  ctx.scale(OTHER_SCALE * pop, OTHER_SCALE * pop);
  OVER_EAR_L.reach = ears;
  OVER_EAR_R.reach = ears;
  OTHER_LOOK[0] = lerp(-3, 0, ears);
  OTHER_LOOK[1] = -1;
  OTHER.tilt = 0.1 * ears;
  OTHER.eyes = lerp(1, 0.2, ears);
  OTHER.browL = -1 * ears;
  OTHER.browR = -1 * ears;
  OTHER.browTilt = 0.3 * ears;
  OTHER.smile = -0.45 * ears;
  person(ctx, OTHER, f.hand('other'));
  ctx.restore();
};

const robedOnPage = (f: DailyFrame, toGate: number) => {
  const { ctx } = f;
  const ask = f.at('ask') * (1 - f.at('lead')) + f.at('askAgain');
  LOOK[0] = lerp(lerp(1, 2, ask), 4, toGate);
  LOOK[1] = lerp(lerp(0, -4, ask), -1, toGate);
  const FIG = f.knob('fig');
  ctx.save();
  ctx.translate(FIG[0], FIG[1]);
  ctx.scale(FIG_SCALE, FIG_SCALE);
  ASKING.tilt = -0.12 * ask;
  ASKING.browL = 4 * ask;
  ASKING.browR = 2 * ask;
  ASKING.browTilt = 0.1 + 0.25 * ask;
  ASKING.mouth = 0.5 * ask;
  ASKING.smile = 0.3 * (1 - ask);
  person(ctx, ASKING, f.hand('robed'));
  glow(ctx, CHEST[0], CHEST[1], 70, C.glow, 1);
  glow(ctx, CHEST[0], CHEST[1], 28, C.gold, 0.7);
  ctx.restore();
};

const dayArc = (f: DailyFrame, i: number): number =>
  i < DAYS - 1 ? f.stagger('days', i, DAYS - 1) : f.at('sixth');

const sunArc = (f: DailyFrame): number => {
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = dayArc(f, i);
    if (d <= 0) continue;
    return i === 0 ? lerp(0.15, 1, d) : d;
  }
  return 0.15 * f.at('dawn');
};

const room = (f: DailyFrame, alpha: number) => {
  const { ctx, w, h } = f;
  const { hand } = f;
  const [wx, wy] = f.knob('window');
  const arc = sunArc(f);
  const day = Math.sin(Math.PI * arc);
  const gold = f.at('sixth');
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = C.board;
  ctx.fillRect(0, 0, w, h);
  glow(ctx, wx + 200, wy + 200, 900, mix(C.peachLow, C.glow, day), 0.55);

  ctx.save();
  ctx.beginPath();
  ctx.rect(wx - WIN_HW, wy - WIN_HH, WIN_HW * 2, WIN_HH * 2);
  ctx.clip();
  const skyTop = mix(C.peachTop, C.tealTop, day);
  SKY_TOP[1] = skyTop;
  const skyLow = mix(mix(C.peachLow, C.tealLow, day), C.gold, 0.6 * gold);
  SKY_LOW[1] = skyLow;
  sky(ctx, w, h, WINDOW_SKY);
  const sx = wx + lerp(-WIN_HW + 60, WIN_HW - 60, arc);
  const sy = wy + HORIZON - SUN_ARC * day;
  glow(ctx, sx, sy, 200, C.glow, 0.9);
  piece(ctx, ellipseShape(sx, sy, 44, 44, 24), C.gold, hand('sun'), { role: 'scenery', line: 0 });
  ctx.save();
  ctx.translate(wx, wy + VIEW_DROP);
  ctx.scale(VIEW_SCALE, VIEW_SCALE);
  piece(ctx, PATH_HILL, C.leaf, hand('hill'), { role: 'scenery', line: 0, shadow: 0.2 });
  stroke(
    ctx,
    PATH_AHEAD,
    { color: C.boardLight, width: 44, jitter: 0.4, taper: 0.5, boil: 'none' },
    hand('path'),
  );
  flowers(f);
  ctx.restore();
  ctx.restore();

  ctx.save();
  ctx.translate(wx, wy);
  for (let i = 0; i < WIN_FRAME.length; i++)
    piece(ctx, WIN_FRAME[i] ?? WIN_BAR_V, C.boardDeep, sub(hand('frame'), i), {
      role: 'scenery',
      kind: 'cut',
      line: 3,
    });
  piece(ctx, WIN_BAR_V, C.boardDeep, hand('barV'), { role: 'scenery', kind: 'cut', line: 3 });
  piece(ctx, WIN_BAR_H, C.boardDeep, hand('barH'), { role: 'scenery', kind: 'cut', line: 3 });
  piece(ctx, SILL, C.boardShade, hand('sill'), { role: 'scenery', kind: 'cut', line: 3 });
  ctx.restore();

  robedAtWindow(f, day);
  inHand(f, arc);
  ctx.restore();
};

const flowers = (f: DailyFrame) => {
  const { ctx } = f;
  const { hand } = f;
  for (let i = 0; i < DAYS; i++) {
    const grown = clamp((dayArc(f, i) - 0.55) / 0.35);
    if (grown <= 0) continue;
    const k = (i + 0.5) / DAYS;
    alongPath(k, AT);
    const side = i % 2 === 0 ? -1 : 1;
    ctx.save();
    ctx.translate(AT[0] + side * 40, AT[1] + 10);
    const s = grown * (2.2 - 0.8 * k);
    ctx.scale(s, s);
    stroke(
      ctx,
      FLOWER_STEM,
      { color: C.leafShade, width: 4, jitter: 0.3, boil: 'none' },
      sub(hand('stem'), i),
    );
    piece(ctx, FLOWER_HEAD, i % 3 === 0 ? C.gold : C.robe, sub(hand('flower'), i), {
      role: 'scenery',
      line: 2,
    });
    ctx.restore();
  }
};

const robedAtWindow = (f: DailyFrame, day: number) => {
  const { ctx } = f;
  OPENED.reach = f.at('reach');
  OPENED.turn = f.at('palmUp');
  OPENED.lent = f.at('handUp') * (1 - f.at('handBack'));
  ctx.save();
  ctx.translate(AT_WINDOW[0], AT_WINDOW[1]);
  ctx.scale(WINDOW_SCALE, WINDOW_SCALE);
  person(ctx, AT_THE_WINDOW, f.hand('atWindow'));
  glow(ctx, CHEST[0], CHEST[1], 60, C.glow, 0.8 + 0.2 * day);
  glow(ctx, CHEST[0], CHEST[1], 24, C.gold, 0.6);
  ctx.restore();
};

const inHand = (f: DailyFrame, arc: number) => {
  const { ctx } = f;
  const up = f.at('handUp') * (1 - f.at('handBack'));
  if (up <= 0) return;
  const working = f.at('days') > 0;
  const night = 1 - Math.sin(Math.PI * arc);
  const open = working ? 1 - 0.55 * night * night : 1;
  LAID[0] = f.stagger('lay', 0, 3);
  LAID[1] = f.stagger('lay', 1, 3);
  LAID[2] = f.stagger('lay', 2, 3);
  LIT[0] = LAID[0] * open;
  LIT[1] = LAID[1] * open;
  LIT[2] = LAID[2] * open;
  pushedHand(ctx, f.hand, FORWARD, up, open, 'far', {
    under: () => glow(ctx, 0, 0, 260, C.glow, 0.5 * open),
    over: () => {
      ctx.save();
      ctx.scale(ICONS_IN_HAND, ICONS_IN_HAND);
      icons(ctx, f.hand, LIT, LAID);
      ctx.restore();
    },
  });
};

const sabbath = (f: DailyFrame, alpha: number) => {
  const { ctx, w, h } = f;
  ctx.save();
  ctx.globalAlpha *= alpha;
  restingField(ctx, w, h, f.hand, f.at('settle'), f.at('rest'), ROBED, 1);
  ctx.restore();
};
