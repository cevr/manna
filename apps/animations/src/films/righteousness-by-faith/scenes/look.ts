import {
  type Camera,
  type CardWord,
  type Frame,
  at,
  camera,
  drawing,
  fullCard,
  inset,
  knobCamera,
  multiplane,
  pushInto,
  pushOn,
  rounded,
  shotPath,
} from '@manna/film/canvas';
import { clamp, lerp } from '@manna/film/core';
import {
  EASE,
  type Expression,
  HAND_ART,
  type Pt,
  acted,
  boilTime,
  reachAbout,
} from '@manna/film/style';
import { CARD_STYLE } from '../card.ts';
import { COURT_RIGS, living } from '../court-cast.ts';
import { contact } from '../court-set.ts';
import { piece } from '../kit.ts';
import {
  CAMP_ORDER,
  type CamperName,
  type CamperPose,
  LOW_ROW,
  MERIT_COUNT,
  POLE,
  SMALL_LINE,
  SNAKES,
  bodyOf,
  campMass,
  campSky,
  dunes,
  firstRoot,
  groundLitter,
  liftedSerpent,
  lowCamp,
  lowHills,
  lowSky,
  merits,
  nearLitter,
  poleAndSerpent,
  sand,
  snake,
  stand,
  tents,
} from '../look-props.ts';
import { GOLD_GLOW, PAGE, cast, shafts } from '../page-set.ts';
import { type OpenSeedPose, glow as shine, openSeed } from '../props.ts';
import { LEAD, LEAD_ARMS, LEAD_KNOBS, reachHands } from '../rigs/lead-rig.ts';
import {
  ICON_BOX,
  ICON_LINE,
  ON_HAND,
  ROW,
  bladeIcon,
  clothIcon,
  handCircle,
} from '../spoke-props.ts';
import { spoke } from './spoke.ts';
import { LAST_FRAME, onHim, word } from './word.ts';

const L = LAST_FRAME;

const BREATH = { period: 4, offset: 2.1 } as const;

const LIFT = 0.05;
const SWAY = 0.012;

const ICONS = [
  { at: ROW.faith, box: ICON_BOX.faith, foot: 70 },
  { at: ROW.cloth, box: ICON_BOX.cloth, foot: 125, draw: clothIcon },
  { at: ROW.blade, box: ICON_BOX.blade, foot: 14, draw: bladeIcon },
] as const;
type Icon = (typeof ICONS)[number];

const ICON_LIGHT = { reach: 0.65, alpha: 0.85, pop: 0.08 } as const;
const PULSE = 0.35;
const ICON_SHADE = { cast: 0.5, foot: 0.8 } as const;
const DIM = { alpha: 0.55, reach: 0.95 } as const;

const SHOULDER = {
  far: LEAD_ARMS.left.shoulder,
  near: LEAD_ARMS.right.shoulder,
} as const satisfies Record<string, Pt>;

const PALM: Pt = [100, -209];
const RAISED: Pt = [-122, -262];

const HAND_R = HAND_ART.r * L.handScale;
const ICON_R = ICON_BOX.faith.up;
const HOME = HAND_R / ICON_R;
const VIA: Pt = [702, 610];

const PALM_SEED = 20;
const SEED_GROW = Math.log(PALM_SEED / ON_HAND.size) / Math.log(HOME);
const SEED_RISE = 0.3;
const SEED_GLOW = { rest: ON_HAND.glow, heard: 0.15, takes: 0.2, through: 0.6 } as const;

const INTO_SEED = 9;
const IRIS_PUSH = 1.25;
const IRIS_GLOW = { reach: 1.7, alpha: 0.55 } as const;
const IRIS_AIM: Pt = [768, 420];

const US: Pt = [LEAD_KNOBS.gazeX, LEAD_KNOBS.gazeY];

const READ = 130;
const HELD = 2 * READ;

const GLAD: Expression = { ...EASE, browY: -1.5, browTilt: 0.06, eyes: 1.12, mouth: 0.6 };
const READING: Expression = { ...EASE, browY: -1, browTilt: 0.1, eyes: 1.06, mouth: 0.3 };
const WONDER: Expression = { ...EASE, browY: -1, browTilt: 0.48, eyes: 1.04, mouth: -0.05 };
const WATCHING: Expression = { ...EASE, browY: -1.4, browTilt: 0.22, eyes: 1.12, mouth: 0.1 };
const HOPING: Expression = { ...EASE, browY: -1.6, browTilt: 0.3, eyes: 1.08, mouth: 0.15 };
const TAKEN: Expression = { ...EASE, browY: -1.4, browTilt: 0.1, eyes: 1.1, mouth: 0.5 };

const LN: Record<keyof typeof LEAD_KNOBS, number> = { ...LEAD_KNOBS };
const SEED: OpenSeedPose = {
  x: 0,
  y: 0,
  rot: ON_HAND.rot,
  size: ON_HAND.size,
  open: 0,
  grown: 1,
  glow: ON_HAND.glow,
  line: ICON_LINE,
  shown: 1,
};

const timeline = {
  toFaith: { mark: 'faith', dur: 0.5, track: 'lead' },
  pulse: { mark: 'faith', word: 'faith', dur: 1.4, track: 'icons' },
  dim: { mark: 'faith', word: 'faith', dur: 0.9, ease: 'inOutSine', track: 'icons' },
  onRow: { mark: 'faith', until: 'where', ease: 'linear', track: 'camera' },
  push: { mark: 'where', dur: 1.8, ease: 'inOutSine', track: 'camera' },
  raise: { mark: 'where', dur: 0.7, ease: 'inOutSine', track: 'hand' },
  home: { mark: 'where', dur: 1.5, ease: 'inOutSine', track: 'hand' },
  wonder: { mark: 'where', dur: 0.6, track: 'lead' },
  heard: { mark: 'where', word: 'word', dur: 1.2, track: 'seed' },
  onHand: { after: 'push', until: 'desert', ease: 'linear', track: 'camera' },
  watch: { mark: 'expects', dur: 0.5, track: 'lead' },
  root: { mark: 'expects', word: 'expects', dur: 2.2, ease: 'outCubic', track: 'seed' },
  offer: { mark: 'hand', dur: 0.9, ease: 'inOutSine', track: 'hand' },
  hope: { mark: 'hand', dur: 0.5, track: 'lead' },
  slide: { mark: 'hand', word: 'just', dur: 0.9, stagger: 0.12, ease: 'inQuad', track: 'merits' },
  lower: { mark: 'hand', word: 'just', dur: 1.1, ease: 'inOutSine', track: 'hand' },
  back: { mark: 'hand', word: 'just', dur: 0.5, track: 'lead' },
  takes: { mark: 'hand', word: 'takes', dur: 1.4, track: 'seed' },
  glad: { mark: 'hand', word: 'takes', dur: 0.5, track: 'lead' },
  still: { mark: 'desert', dur: 0.5, track: 'camera' },
  through: { mark: 'desert', dur: 1.4, ease: 'inCubic', track: 'camera' },
  iris: { mark: 'desert', offset: 0.55, dur: 1.2, ease: 'inOutSine', track: 'iris' },
  camp: {
    after: 'iris',
    until: { cue: 'toClimber', edge: 'start' },
    ease: 'linear',
    track: 'camera',
  },
  toClimber: { mark: 'desert', word: 'imagine', until: 'pole', ease: 'inOutSine', track: 'camera' },
  strike: { mark: 'desert', word: 'bitten', dur: 0.6, track: 'snakes' },
  start: { mark: 'desert', word: 'bitten', offset: 0.15, dur: 0.7, track: 'climber' },
  bend: {
    mark: 'desert',
    word: 'bitten',
    offset: 0.2,
    dur: 1.4,
    ease: 'inOutSine',
    track: 'climber',
  },
  wide: { mark: 'pole', dur: 1.3, ease: 'inOutSine', track: 'camera' },
  rise: { mark: 'pole', word: 'set', dur: 1.4, ease: 'outBack', track: 'pole' },
  lit: { mark: 'pole', word: 'serpent', dur: 1.2, track: 'pole' },
  lookUp: { mark: 'pole', word: 'looks', dur: 1.4, stagger: 0.45, track: 'crowd' },
  lives: {
    mark: 'pole',
    word: 'lives',
    dur: 1.6,
    stagger: 0.45,
    ease: 'inOutSine',
    track: 'crowd',
  },
  onPole: { after: 'wide', until: 'harder', ease: 'linear', track: 'camera' },
  toPole: { mark: 'harder', dur: 0.9, ease: 'inOutSine', track: 'climber' },
  onClimb: { mark: 'harder', dur: 1, ease: 'inOutSine', track: 'camera' },
  climbing: { mark: 'harder', word: 'make', until: 'climb', ease: 'linear', track: 'climber' },
  grip: { with: 'climbing', dur: 0.19, ease: 'linear', track: 'climber' },
  up: { after: 'onClimb', until: 'climb', ease: 'inOutSine', track: 'camera' },
  stop: { mark: 'climb', dur: 0.3, track: 'climber' },
  slip: { mark: 'climb', word: 'one', dur: 0.55, ease: 'inQuad', track: 'climber' },
  down: { mark: 'climb', word: 'one', dur: 0.8, ease: 'inOutSine', track: 'camera' },
  turn: { mark: 'climb', word: 'has', dur: 0.5, ease: 'inOutSine', track: 'climber' },
  gaze: { mark: 'climb', word: 'climb', dur: 0.7, ease: 'inOutSine', track: 'climber' },
  close: { mark: 'climb', word: 'pole', until: 'look', ease: 'inOutSine', track: 'camera' },
  heal: { mark: 'climb', word: 'pole', until: 'look', ease: 'outCubic', track: 'climber' },
  card: { mark: 'look', word: 'look', until: 'lifted', track: 'card' },
  low: { mark: 'lifted', dur: 0, track: 'camera' },
  tilt: { mark: 'lifted', until: { at: 'speechEnd' }, ease: 'inOutSine', track: 'camera' },
  son: { mark: 'lifted', word: 'son', dur: 1.6, track: 'pole' },
  pull: { at: 'speechEnd', dur: 1.3, ease: 'inOutSine', track: 'camera' },
} as const;

const knobs = {
  where: [585, 562],
  whereZoom: 3.3,
  camp: [768, 522],
  campZoom: 1.17,
  campCreep: 1.04,
  bitten: [590, 665],
  bittenZoom: 1.9,
  pole: [768, 470],
  poleZoom: 1.12,
  climb: [705, 640],
  climbZoom: 1.95,
  climbUp: [715, 420],
  climbUpZoom: 1.95,
  face: [660, 500],
  faceZoom: 3.6,
  low: [768, 772],
  lowZoom: 1.5,
  lifted: [768, 512],
  liftedZoom: 1.06,
} as const;

type LookFrame = Frame<keyof typeof timeline & string, typeof knobs, typeof COURT_RIGS>;

const fromFeet = (p: Pt): Pt => [p[0] - L.lead[0], p[1] - L.lead[1]];

const toward = (a: Pt, b: Pt, k: number): Pt => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

const readingAt = (p: Pt, reach = READ): Pt => {
  const dx = p[0] - US[0];
  const dy = p[1] - US[1];
  const d = Math.hypot(dx, dy) || 1;
  return [US[0] + (dx / d) * reach, US[1] + (dy / d) * reach];
};

const readingOf = (icon: Icon): Pt =>
  readingAt(fromFeet([icon.at[0] + icon.box.dx, icon.at[1] - icon.box.up]));

const handAt = (f: LookFrame, p: Pt) =>
  at(f.ctx, { x: p[0], y: p[1] }, () =>
    f.rive('leadHand', { timelines: [['boil', boilTime(f.boil)]], size: L.handScale }),
  );

const handsOf = (f: LookFrame, closing: number) => {
  const rest = (side: Pt): Pt => onHim(side, 0);
  const raise = f.at('raise') * (1 - closing);
  const reached = reachAbout(onHim(SHOULDER.near, 0), rest(L.hands.near), onHim(PALM, 0), raise);
  const near: Pt = reached;
  const farShoulder = onHim(SHOULDER.far, 0);
  const lifted = reachAbout(farShoulder, rest(L.hands.far), onHim(RAISED, 0), f.at('offer'));
  const raised: Pt = lifted;
  const far = reachAbout(farShoulder, raised, rest(L.hands.far), f.at('lower'));
  const arms = reachHands(LN, fromFeet(far), fromFeet(near));
  return { near: onHim(arms.right, 0), far: onHim(arms.left, 0) };
};

const pose = (f: LookFrame, gaze: Pt, closing: number) => {
  acted(LN, GLAD, [
    [READING, f.at('toFaith')],
    [WONDER, f.at('wonder')],
    [WATCHING, f.at('watch')],
    [HOPING, f.at('hope')],
    [WATCHING, f.at('back')],
    [TAKEN, f.at('glad')],
    [GLAD, closing],
  ]);
  LN.gazeX = gaze[0];
  LN.gazeY = gaze[1];
  LN.lean = 0;
  LN.tilt = lerp(LIFT, 0, f.at('wonder') * (1 - closing)) + SWAY * Math.sin(f.t * 0.7);
  LN.nod = 0;
};

const curve = (a: Pt, via: Pt, b: Pt, k: number): Pt => {
  const u = 1 - k;
  return [
    u * u * a[0] + 2 * u * k * via[0] + k * k * b[0],
    u * u * a[1] + 2 * u * k * via[1] + k * k * b[1],
  ];
};

const FAITH_MIDDLE: Pt = [ROW.faith[0], ROW.faith[1] - ICON_R];

const openHandAt = (home: number, palm: Pt) => {
  const [x, y] = curve(FAITH_MIDDLE, VIA, palm, home);
  return { x, y, scale: HOME ** home };
};

const seedOn = (x: number, y: number, scale: number, home: number) => {
  const size = ON_HAND.size * scale ** SEED_GROW;
  SEED.size = size;
  SEED.x = x + ON_HAND.dx * scale;
  SEED.y = y + (ON_HAND.dy + ICON_R) * scale - SEED_RISE * (size - ON_HAND.size * scale);
  SEED.rot = ON_HAND.rot;
  SEED.open = 0;
  SEED.line = lerp(ICON_LINE, SMALL_LINE, home);
  SEED.shown = 1;
};

const seedFoot = (): Pt => [
  SEED.x - (SEED.size / 2) * Math.sin(SEED.rot),
  SEED.y + (SEED.size / 2) * Math.cos(SEED.rot),
];

const rowShadows = (f: LookFrame, home: number) => {
  const { ctx } = f;
  ICONS.forEach((icon) => {
    const shown = icon === ICONS[0] ? 1 - home : 1;
    if (shown <= 0) return;
    const x = icon.at[0] + icon.box.dx;
    cast(ctx, x - icon.foot, x + icon.foot, icon.at[1], icon.box.tall, ICON_SHADE.cast * shown);
    ctx.save();
    ctx.globalAlpha *= ICON_SHADE.foot * shown;
    contact(ctx, x, icon.at[1] + 2, icon.foot);
    ctx.restore();
  });
};

const others = (f: LookFrame, closing: number) => {
  const { ctx } = f;
  const dim = f.at('dim') * (1 - closing);
  for (const icon of [ICONS[1], ICONS[2]]) {
    const { box } = icon;
    const x = icon.at[0] + box.dx;
    const y = icon.at[1] - box.up;
    const size = Math.sqrt(box.tall * box.wide);
    shine(ctx, x, y, ICON_LIGHT.reach * size, GOLD_GLOW, ICON_LIGHT.alpha * (1 - dim));
    icon.draw(ctx, icon.at[0], icon.at[1], 1);
    if (dim <= 0) continue;
    const r = DIM.reach * size;
    ctx.save();
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, PAGE);
    g.addColorStop(0.7, PAGE);
    g.addColorStop(1, `${PAGE}00`);
    ctx.globalAlpha *= DIM.alpha * dim;
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    ctx.restore();
  }
};

const OPEN = { x: 0, y: 0, scale: 1, home: 0, pop: 0 };

const placeOpenHand = (f: LookFrame, palm: Pt, closing: number) => {
  const home = clamp(f.at('home')) * (1 - closing);
  const p = openHandAt(home, palm);
  OPEN.pop = Math.max(
    f.keys('pulse', [
      [0, 0],
      [0.35, 1, 'outCubic'],
      [1, 0, 'inOutSine'],
    ]),
    f.at('pull'),
  );
  OPEN.x = p.x;
  OPEN.y = p.y;
  OPEN.scale = p.scale * (1 + ICON_LIGHT.pop * OPEN.pop);
  OPEN.home = home;
  seedOn(OPEN.x, OPEN.y, OPEN.scale, home);
};

const openHand = (f: LookFrame) => {
  if (OPEN.home >= 1) return;
  const reach = ICON_LIGHT.reach * 2 * ICON_R * OPEN.scale;
  shine(
    f.ctx,
    OPEN.x,
    OPEN.y,
    reach,
    GOLD_GLOW,
    (ICON_LIGHT.alpha + PULSE * OPEN.pop) * (1 - OPEN.home),
  );
  handCircle(f.ctx, OPEN.x, OPEN.y + ICON_R * OPEN.scale, OPEN.scale);
};

const seedInHand = (f: LookFrame, closing: number) => {
  const { ctx } = f;
  const heard = f.keys('heard', [
    [0, 0],
    [0.3, 1, 'outCubic'],
    [1, 0, 'inOutSine'],
  ]);
  const takes = f.keys('takes', [
    [0, 0],
    [0.3, 1, 'outCubic'],
    [1, 0.4, 'inOutSine'],
  ]);
  SEED.glow =
    SEED_GLOW.rest +
    SEED_GLOW.heard * heard +
    SEED_GLOW.takes * takes +
    SEED_GLOW.through * f.at('through') * (1 - closing);
  const [rx, ry] = seedFoot();
  firstRoot(ctx, rx, ry, f.at('root') * (1 - closing), SMALL_LINE);
  openSeed(ctx, SEED);
};

const gazeOf = (f: LookFrame, raised: Pt, closing: number): Pt => {
  let g = toward(readingOf(ICONS[2]), readingOf(ICONS[0]), f.at('toFaith'));
  g = toward(g, readingAt(fromFeet([OPEN.x, OPEN.y]), HELD), f.at('wonder'));
  g = toward(g, readingAt(fromFeet(seedFoot()), HELD), f.at('watch'));
  g = toward(g, readingAt(fromFeet([raised[0], raised[1] - 30]), HELD), f.at('hope'));
  g = toward(g, readingAt(fromFeet([SEED.x, SEED.y]), HELD), f.at('back'));
  return toward(g, readingOf(ICONS[0]), closing);
};

const page = (f: LookFrame, closing: number): Camera => {
  const { ctx, w, h } = f;
  const row = f.knobsOf(spoke);
  const rowCam = pushOn(knobCamera(row('row'), row('rowZoom')), row('creep'), 1);
  const near = knobCamera(f.knob('where'), f.knob('whereZoom'));
  const hands = handsOf(f, closing);
  placeOpenHand(f, hands.near, closing);
  pose(f, gazeOf(f, onHim(RAISED, 0), closing), closing);
  const intoSeed: Camera = { x: SEED.x, y: SEED.y, zoom: f.knob('whereZoom') * INTO_SEED };
  const cam: Camera =
    closing > 0
      ? rowCam
      : shotPath(rowCam, [
          [f.at('onRow'), pushOn(rowCam, row('creep'), 1)],
          [f.at('push'), near, pushInto],
          [f.at('onHand'), pushOn(near, row('creep'), 1)],
          [f.at('through'), intoSeed, pushInto],
        ]);
  const [fx, fy] = L.lead;
  piece(ctx, rounded(w / 2, h / 2, L.sheet.w, L.sheet.h, 0), PAGE, f.handsOf(word)('page'), {
    role: 'scenery',
    kind: 'torn',
    torn: 4,
    shadow: 0,
  });
  shafts(ctx, w, h);
  const breath = closing > 0 ? 0 : 1 - f.at('still');
  camera(
    ctx,
    cam,
    w,
    h,
    () => {
      cast(ctx, fx - 46, fx + 46, fy, LEAD.height, 0.6);
      contact(ctx, fx, fy + 2, 95);
      rowShadows(f, OPEN.home);
      at(ctx, { x: fx, y: fy }, () =>
        f.rive('lead', { timelines: living(f, BREATH.period, BREATH.offset), numbers: LN }),
      );
      others(f, closing);
      handAt(f, hands.far);
      const slid = (i: number) => f.stagger('slide', i, MERIT_COUNT);
      if (f.at('offer') > 0 && closing <= 0) {
        const holding = f.at('slide') > 0 ? onHim(RAISED, 0) : hands.far;
        merits(ctx, holding[0], holding[1], slid, SMALL_LINE);
      }
      handAt(f, hands.near);
      openHand(f);
      seedInHand(f, closing);
    },
    breath,
  );
  return cam;
};

const onScreen = (f: LookFrame, cam: Camera, p: Pt): Pt => {
  const z = cam.zoom ?? 1;
  return [(p[0] - cam.x) * z + f.w / 2, (p[1] - cam.y) * z + f.h / 2];
};

const covering = (f: LookFrame, [x, y]: Pt) =>
  Math.max(
    Math.hypot(x, y),
    Math.hypot(f.w - x, y),
    Math.hypot(x, f.h - y),
    Math.hypot(f.w - x, f.h - y),
  ) + 8;

const porthole = (f: LookFrame, [x, y]: Pt, r: number, alpha: number, draw: () => void) => {
  const { ctx } = f;
  if (alpha <= 0 || r <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.clip();
  inset(ctx, draw);
  ctx.restore();
};

const PANEL = { w: 1536, h: 1024 } as const;
const CAMP_REST: Pt = [768, 512];
const CAMP_AIR = { haze: '#f6dcc0', thickness: 1.5 } as const;

const CROWD: ReadonlyArray<CamperName> = [
  'broad',
  'tallBack',
  'womanRight',
  'womanLeft',
  'child',
  'tallLeft',
  'elder',
];
const BITTEN: Readonly<Partial<Record<CamperName, number>>> = {
  tallLeft: 0.75,
  womanLeft: 0.55,
  broad: 0.65,
  womanRight: 0.4,
  elder: 0.85,
};
const STOOP = { lean: 0.08, head: 0.5 } as const;
const CAMP_BREATH = { period: 4.3, apart: 1.3 } as const;

const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

const breathOf = (f: LookFrame, who: CamperName) =>
  ((f.t + CAMP_BREATH.apart * CAMP_ORDER.indexOf(who)) * 2 * Math.PI) / CAMP_BREATH.period;

const crowdPose = (f: LookFrame, who: CamperName): CamperPose => {
  const home = stand(who);
  const i = CROWD.indexOf(who);
  const up = f.stagger('lookUp', i, CROWD.length);
  const hurt = (BITTEN[who] ?? 0) * (1 - f.stagger('lives', i, CROWD.length));
  const watching = clamp(f.at('toPole') - f.at('gaze'));
  const toPole = home.x < POLE.x ? 1 : -1;
  const facing = lerp(home.facing, 0.75 * toPole, up);
  return {
    ...home,
    facing,
    lift: lerp(lerp(-STOOP.head * hurt, 0.9, up), 0.45, watching),
    lean: STOOP.lean * hurt * Math.sign(facing),
    breath: breathOf(f, who),
  };
};

const CLIMB = {
  at: [POLE.x - 112, 834],
  high: 230,
  heaves: 3,
  slip: 0.3,
  steps: 3,
  shake: 1.6,
  shakeRate: 47,
} as const;

const GLAD_HANDS = { x: 0.8, y: 0.6 } as const;

const heave = (k: number) => {
  const n = CLIMB.heaves;
  const u = clamp(k) * n;
  const i = Math.min(n - 1, Math.floor(u));
  const w = u - i;
  const gain = 1 - CLIMB.slip;
  const swap = smooth(0.05, 0.4, w);
  return {
    up: (i * gain + smooth(0, 0.5, w) - CLIMB.slip * smooth(0.6, 1, w)) / (n * gain),
    left: i % 2 === 0 ? swap : 1 - swap,
  };
};

const climberPose = (f: LookFrame): CamperPose => {
  const home = stand('climber');
  const b = bodyOf('climber');
  const s = home.scale;
  const go = f.at('toPole');
  const k = f.at('climbing');
  const slip = f.at('slip');
  const turn = f.at('turn');
  const stop = f.at('stop');
  const bent = f.at('bend') * (1 - go);
  const heal = f.at('heal');
  const climbed = heave(k);
  const height = CLIMB.high * climbed.up * (1 - slip);
  const grip = f.at('grip');
  const holding = grip * (1 - turn);
  const strain = grip * (1 - stop);
  const startle = f.keys('start', [
    [0, 0],
    [0.3, 1, 'outCubic'],
    [1, 0, 'inOutSine'],
  ]);
  const x = lerp(home.x, CLIMB.at[0], go) + strain * CLIMB.shake * Math.sin(f.t * CLIMB.shakeRate);
  const y =
    lerp(home.y, CLIMB.at[1], go) - height - 5 * Math.abs(Math.sin(Math.PI * CLIMB.steps * go));

  const poleX = (POLE.x - x) / s - 6;
  const hi: Pt = [poleX, -b.tall - 0.12 * b.head];
  const lo: Pt = [poleX + 2, -b.tall + 1.05 * b.head];
  const [restL, restR] = home.hands;
  const free = (p: Pt, side: number): Pt =>
    toward(
      [p[0] + 8 * side * startle, p[1] - 70 * startle],
      [side * GLAD_HANDS.x * b.shoulder, -GLAD_HANDS.y * b.tall],
      heal,
    );
  const left = toward(free(restL, -1), toward(lo, hi, climbed.left), holding);
  const right = toward(free(restR, 1), toward(hi, lo, climbed.left), holding);
  return {
    ...home,
    x,
    y,
    facing: lerp(lerp(home.facing, 1, go), 0.45, turn),
    lift: lerp(-STOOP.head * bent, 1, f.at('gaze')),
    lean: 0.1 * holding + STOOP.lean * bent,
    breath: breathOf(f, 'climber'),
    hands: [left, right],
    feet: [10 * holding + 18 * startle, 34 * holding + 14 * startle],
    ground: height < 1,
  };
};

const SLITHER = { left: 16, middle: 9, right: 14, leftFrom: -60 } as const;

const snakes = (f: LookFrame) => {
  const { ctx } = f;
  const since = Math.max(0, f.t - f.mark('desert'));
  snake(ctx, SNAKES.middle, SLITHER.middle * since, f.t, 0);
  snake(ctx, SNAKES.right, SLITHER.right * since, f.t, 0);
  const strike = f.keys('strike', [
    [0, 0],
    [0.35, 1, 'outCubic'],
    [1, 0, 'inOutSine'],
  ]);
  snake(ctx, SNAKES.left, SLITHER.leftFrom + SLITHER.left * since, f.t, strike);
};

const ground = (f: LookFrame) => {
  const { ctx } = f;
  sand(ctx, 'ground', f.hand('ground'));
  groundLitter(ctx);
  const climber = climberPose(f);
  const poseOf = (who: CamperName) => (who === 'climber' ? climber : crowdPose(f, who));
  for (const who of CAMP_ORDER) if (stand(who).y < POLE.foot) campMass(ctx, who, poseOf(who));
  poleAndSerpent(ctx, f.at('rise'), f.at('lit'), f.hand('mound'));
  for (const who of CAMP_ORDER) if (stand(who).y >= POLE.foot) campMass(ctx, who, poseOf(who));
  snakes(f);
};

const campCamera = (f: LookFrame): Camera => {
  const wide = knobCamera(f.knob('camp'), f.knob('campZoom'));
  const pole = knobCamera(f.knob('pole'), f.knob('poleZoom'));
  const foot = knobCamera(f.knob('climb'), f.knob('climbZoom'));
  return shotPath(wide, [
    [f.at('camp'), pushOn(wide, f.knob('campCreep'), 1)],
    [f.at('toClimber'), knobCamera(f.knob('bitten'), f.knob('bittenZoom')), pushInto],
    [f.at('wide'), pole, pushInto],
    [f.at('onPole'), pushOn(pole, f.knob('campCreep'), 1)],
    [f.at('onClimb'), foot, pushInto],
    [f.at('up'), knobCamera(f.knob('climbUp'), f.knob('climbUpZoom'))],
    [f.at('down'), foot],
    [f.at('close'), knobCamera(f.knob('face'), f.knob('faceZoom')), pushInto],
  ]);
};

const campShot = (f: LookFrame, push = 1) => {
  const { ctx, w, h } = f;
  const cam = pushOn(campCamera(f), push, 1);
  multiplane(
    ctx,
    cam,
    w,
    h,
    [
      {
        z: 1.2,
        draw: () => {
          campSky(ctx);
          dunes(ctx, f.hand('dunes'));
        },
      },
      {
        z: 1.1,
        draw: () => {
          sand(ctx, 'far', f.hand('farSand'));
          tents(ctx, 'far', f.hand('farTents'));
        },
      },
      {
        z: 1.05,
        draw: () => {
          sand(ctx, 'near', f.hand('nearSand'));
          tents(ctx, 'near', f.hand('nearTents'));
          shafts(ctx, PANEL.w, PANEL.h);
        },
      },
      { z: 1, draw: () => ground(f) },
      { z: 0.95, draw: () => nearLitter(ctx) },
    ],
    { rest: CAMP_REST, haze: CAMP_AIR.haze, thickness: CAMP_AIR.thickness, drift: 0 },
  );
};

const SON_GLOW = 0.6;

const lowPose = (f: LookFrame, who: CamperName): CamperPose => {
  const row = LOW_ROW[who];
  return {
    ...stand(who),
    x: row.at[0],
    y: row.at[1],
    scale: row.scale,
    facing: row.facing,
    lift: 1,
    breath: breathOf(f, who),
    ground: false,
  };
};

const lowCamera = (f: LookFrame): Camera =>
  shotPath(knobCamera(f.knob('low'), f.knob('lowZoom')), [
    [f.at('tilt'), knobCamera(f.knob('lifted'), f.knob('liftedZoom'))],
  ]);

const LOW_AIM: Pt = [768, 330];

const LOW_ORDER: ReadonlyArray<CamperName> = [...CAMP_ORDER].sort(
  (a, b) => LOW_ROW[a].at[1] - LOW_ROW[b].at[1],
);

const lowShot = (f: LookFrame) => {
  const { ctx, w, h } = f;
  const cam = lowCamera(f);
  const swell = f.keys('son', [
    [0, 0],
    [0.35, 1, 'outCubic'],
    [1, 0.5, 'inOutSine'],
  ]);
  multiplane(
    ctx,
    cam,
    w,
    h,
    [
      {
        z: 1.25,
        draw: () => {
          lowSky(ctx);
          shafts(ctx, PANEL.w, PANEL.h);
        },
      },
      { z: 1.12, draw: () => lowHills(ctx, f.hand('lowHills')) },
      { z: 1.05, draw: () => lowCamp(ctx, f.hand('lowCamp')) },
      { z: 1, draw: () => liftedSerpent(ctx, 1 + SON_GLOW * swell) },
      {
        z: 0.92,
        draw: () => {
          for (const who of LOW_ORDER) campMass(ctx, who, lowPose(f, who));
        },
      },
    ],
    { rest: CAMP_REST, haze: CAMP_AIR.haze, thickness: CAMP_AIR.thickness, drift: 0 },
  );
};

const lookOnly = (words: ReadonlyArray<CardWord>): ReadonlyArray<CardWord> =>
  words.filter((w) => w.payoff).map((w) => ({ ...w, text: w.text.replace(/[.,!?]+$/, '') }));

export const look = drawing({
  timeline,
  knobs,
  rigs: COURT_RIGS,
  light: L.light,
  draw: (f) => {
    if (f.at('low') >= 1) {
      const pull = f.at('pull');
      if (pull <= 0) {
        lowShot(f);
        return;
      }
      const cam = page(f, 1);
      const middle = onScreen(f, cam, FAITH_MIDDLE);
      const from = covering(f, middle);
      const r = from * ((ICON_R * (cam.zoom ?? 1)) / from) ** pull;
      const pivot = toward(middle, onScreen(f, lowCamera(f), LOW_AIM), pull);
      const shrink = Math.sqrt(r / from);
      porthole(f, middle, r, 1 - smooth(0.7, 1, pull), () => {
        f.ctx.save();
        f.ctx.translate(middle[0], middle[1]);
        f.ctx.scale(shrink, shrink);
        f.ctx.translate(-pivot[0], -pivot[1]);
        lowShot(f);
        f.ctx.restore();
      });
      return;
    }
    const iris = f.at('iris');
    if (iris >= 1) {
      campShot(f);
      return;
    }
    const cam = page(f, 0);
    if (iris <= 0) return;
    const seed = onScreen(f, cam, [SEED.x, SEED.y]);
    const from = Math.max(2, (SEED.size / 2) * (cam.zoom ?? 1));
    const r = from * (covering(f, seed) / from) ** iris;
    shine(f.ctx, seed[0], seed[1], IRIS_GLOW.reach * r, GOLD_GLOW, IRIS_GLOW.alpha * (1 - iris));
    const push = lerp(IRIS_PUSH, 1, iris);
    const aim = onScreen(f, pushOn(campCamera(f), push, 1), IRIS_AIM);
    porthole(f, seed, r, 1, () => {
      f.ctx.save();
      f.ctx.translate((seed[0] - aim[0]) * (1 - iris), (seed[1] - aim[1]) * (1 - iris));
      campShot(f, push);
      f.ctx.restore();
    });
  },
  cards: [
    {
      cue: 'card',
      from: 'look',
      to: 'lifted',
      payoff: 'look',
      draw: (f, words) => fullCard(f, lookOnly(words), CARD_STYLE),
    },
  ],
});
