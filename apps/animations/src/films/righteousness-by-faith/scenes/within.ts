import {
  type Box,
  type Camera,
  type CardWord,
  type Frame,
  type Light,
  at,
  camera,
  drawing,
  fullCard,
  knobCamera,
  measure,
  multiplane,
  pushOn,
  rounded,
  shotPath,
  unprobed,
  verse,
  write,
} from '@manna/film/canvas';
import { type Key, clamp, lerp } from '@manna/film/core';
import { EASE, type Expression, type Pt, acted, boilTime } from '@manna/film/style';
import { CARD_STYLE, VERSE_STYLE } from '../card.ts';
import { LANDING_RIGS, living } from '../court-cast.ts';
import { contact } from '../court-set.ts';
import { C, F, piece } from '../kit.ts';
import { type CamperName, type CamperPose, bodyOf, campMass, stand } from '../look-props.ts';
import {
  GOLD_GLOW,
  PAGE,
  TABLET,
  type TabletsPose,
  cast,
  goldLine,
  shafts,
  tablets,
  tabletsAt,
} from '../page-set.ts';
import { type OpenSeedPose, openSeed, glow as shine } from '../props.ts';
import { CHRIST_KNOBS } from '../rigs/christ-rig.ts';
import { LEAD, LEAD_KNOBS, TUNIC, reachHands } from '../rigs/lead-rig.ts';
import { ICON_BOX, ON_HAND, ROW, bladeIcon, clothIcon, faithIcon } from '../spoke-props.ts';
import {
  BAND,
  BEARERS,
  CHRIST_TALL,
  CROWD,
  type Held,
  type LyingPose,
  NEAR,
  ROPES,
  SIDES,
  SLACK,
  bedGathered,
  bedShadow,
  heldPose,
  heldScale,
  hipOn,
  hold,
  holeShafts,
  holeSky,
  lyingHead,
  lyingMass,
  rollMass,
  rope,
  roomCeiling,
  roomFloor,
  roomWall,
  templeFar,
  templeFloor,
  templeNear,
  templeWall,
  traceHole,
} from '../within-props.ts';
import { spoke } from './spoke.ts';
import { LAST_FRAME, onHim, word } from './word.ts';

const L = LAST_FRAME;

const BREATH = { period: 4, offset: 2.1 } as const;

const LIFT = 0.05;
const SWAY = 0.012;

const PLAIN = 0;

const ICONS = [
  { at: ROW.faith, box: ICON_BOX.faith, foot: 70 },
  { at: ROW.cloth, box: ICON_BOX.cloth, foot: 125 },
  { at: ROW.blade, box: ICON_BOX.blade, foot: 14 },
] as const;
type Icon = (typeof ICONS)[number];

const ICON_LIGHT = { reach: 0.65, alpha: 0.85, pop: 0.08 } as const;
const PULSE = 0.35;
const CLOTH_GLOW = 0.35;
const ICON_SHADE = { cast: 0.5, foot: 0.8 } as const;
const DIM = { alpha: 0.55, reach: 0.95 } as const;

const US: Pt = [LEAD_KNOBS.gazeX, LEAD_KNOBS.gazeY];

const READ = 130;

const GLAD: Expression = { ...EASE, browY: -1.5, browTilt: 0.06, eyes: 1.12, mouth: 0.6 };
const READING: Expression = { ...EASE, browY: -1, browTilt: 0.1, eyes: 1.06, mouth: 0.3 };
const ASKING: Expression = { ...EASE, browY: -2.4, browTilt: 0.18, eyes: 1.1, mouth: -0.2 };
const SURE: Expression = { ...EASE, browY: -1.2, browTilt: 0.06, eyes: 1.04, mouth: 0.7 };

const AT_TABLETS: Pt = [330, -170];
const WONDER: Expression = { ...EASE, browY: -2, browTilt: 0.16, eyes: 1.15, mouth: 0.4 };
const ALIVE: Expression = { ...EASE, browY: -2.2, browTilt: 0.1, eyes: 1.14, mouth: 1.1 };
const AT_CHEST: Pt = [-10, -150];
const RECEIVING: Expression = { ...EASE, browY: -1.7, browTilt: 0.14, eyes: 1.08, mouth: 0.5 };
const WARMED: Expression = { ...EASE, browY: -1.9, browTilt: 0.06, eyes: 1.1, mouth: 1.2 };
const BOW = { nod: 6, down: 140 } as const;
const SHAKE = { tilt: 0.06, gaze: 45, times: 2 } as const;

const LN: Record<keyof typeof LEAD_KNOBS, number> = { ...LEAD_KNOBS };
const SEED: OpenSeedPose = {
  x: 0,
  y: 0,
  rot: ON_HAND.rot,
  size: ON_HAND.size,
  open: 0,
  grown: 1,
  glow: ON_HAND.glow,
  line: 5,
  shown: 1,
};

const timeline = {
  toBlade: { mark: 'power', dur: 0.5, track: 'lead' },
  pulse: { mark: 'power', word: 'power', dur: 1.4, track: 'icons' },
  dim: { mark: 'power', word: 'power', dur: 0.9, ease: 'inOutSine', track: 'icons' },
  glad: { mark: 'power', word: 'power', dur: 0.5, track: 'lead' },
  onRow: { mark: 'power', until: 'remember', ease: 'linear', track: 'camera' },
  toCourt: { mark: 'remember', dur: 0, track: 'shot' },
  onCourt: {
    mark: 'remember',
    until: { cue: 'toLaw', edge: 'start' },
    ease: 'linear',
    track: 'camera',
  },
  send: { mark: 'remember', word: 'go', offset: -0.25, dur: 1.5, track: 'christ' },
  turn: { mark: 'remember', word: 'go', dur: 0.5, track: 'woman' },
  walk: { mark: 'remember', word: 'go', offset: 0.25, dur: 1.9, ease: 'inSine', track: 'woman' },
  toLaw: { mark: 'remember', word: 'Is', offset: -0.35, dur: 0, track: 'shot' },
  onLaw: { after: 'toLaw', until: 'command', ease: 'linear', track: 'camera' },
  ask: { mark: 'remember', word: 'mocking', offset: -0.25, dur: 0.5, track: 'lead' },
  no: { mark: 'remember', word: 'her', offset: 0.96, dur: 0.8, ease: 'linear', track: 'lead' },
  easy: { mark: 'remember', word: 'her', offset: 0.96, dur: 0.6, track: 'lead' },
  toCommand: { mark: 'command', dur: 1.2, ease: 'inOutSine', track: 'camera' },
  onCommand: { after: 'toCommand', until: 'write', ease: 'linear', track: 'camera' },
  part: { mark: 'command', dur: 1, track: 'law' },
  kindle: { mark: 'command', word: 'command', dur: 0.9, track: 'law' },
  watch: { mark: 'command', dur: 0.5, track: 'lead' },
  drop: { mark: 'command', word: 'seed', offset: -0.55, dur: 0.8, ease: 'outSoft', track: 'seed' },
  appear: { with: 'drop', dur: 0.15, ease: 'linear', track: 'seed' },
  follow: { mark: 'command', word: 'seed', offset: -0.5, dur: 0.6, track: 'lead' },
  open: { mark: 'command', word: 'inside', until: { cue: 'life', edge: 'start' }, track: 'seed' },
  wonder: { mark: 'command', word: 'inside', dur: 0.6, track: 'lead' },
  life: { mark: 'command', word: 'His', dur: 0.9, ease: 'outCubic', track: 'seed' },
  alive: { mark: 'command', word: 'life', offset: -0.2, dur: 0.5, track: 'lead' },
  settle: { mark: 'write', dur: 1.3, ease: 'inOutSine', track: 'law' },
  unshadow: { mark: 'write', dur: 0.52, ease: 'inOutSine', track: 'law' },
  seedIn: { mark: 'write', offset: 0.61, dur: 0.36, ease: 'inOutSine', track: 'law' },
  bare: { mark: 'write', offset: 0.87, dur: 0.43, ease: 'inOutSine', track: 'law' },
  close: { mark: 'write', dur: 0.9, ease: 'inOutSine', track: 'law' },
  onHeart: {
    after: 'settle',
    until: { cue: 'page', edge: 'start' },
    ease: 'linear',
    track: 'camera',
  },
  receive: { mark: 'write', offset: 0.4, dur: 0.6, track: 'lead' },
  heart: { mark: 'write', offset: 0.8, dur: 0.9, track: 'heart' },
  lines: { mark: 'write', word: 'into', dur: 0.8, track: 'heart' },
  warmed: { mark: 'write', word: 'mind', dur: 0.6, track: 'lead' },
  page: { mark: 'write', word: 'and', offset: -0.45, dur: 0.4, ease: 'outCubic', track: 'verse' },
  sweep: {
    mark: 'write',
    word: 'and',
    until: { cue: 'flood', edge: 'start' },
    ease: 'linear',
    track: 'verse',
  },
  flood: { mark: 'write', word: 'hearts', offset: 0.45, dur: 0.45, ends: true, track: 'verse' },
  card: { mark: 'write', word: 'hearts', offset: 0.45, until: 'bed', track: 'card' },
  toRoom: { mark: 'bed', dur: 0, track: 'shot' },
  onRoom: { mark: 'bed', until: { cue: 'toWe', edge: 'start' }, ease: 'linear', track: 'camera' },
  strain: {
    mark: 'bed',
    word: 'bed',
    offset: 0.12,
    until: { cue: 'fall', edge: 'start' },
    ease: 'linear',
    track: 'man',
  },
  fall: { mark: 'bed', word: 'walk', dur: 0.45, ease: 'inCubic', track: 'man' },
  again: {
    mark: 'bed',
    word: 'however',
    offset: -0.1,
    until: { cue: 'back', edge: 'start' },
    ease: 'linear',
    track: 'man',
  },
  back: { mark: 'bed', word: 'wished', dur: 0.45, ease: 'inCubic', track: 'man' },
  toWe: { mark: 'we', dur: 0, track: 'shot' },
  onWe: { mark: 'we', until: 'arose', ease: 'linear', track: 'camera' },
  pull: {
    mark: 'we',
    word: 'stop',
    offset: -0.05,
    until: { cue: 'slip', edge: 'start' },
    ease: 'linear',
    track: 'lead',
  },
  slip: { mark: 'we', word: 'sinning', offset: 0.3, dur: 0.4, ease: 'inCubic', track: 'lead' },
  pullAgain: {
    mark: 'we',
    word: 'however',
    offset: -0.1,
    until: { cue: 'spent', edge: 'start' },
    ease: 'linear',
    track: 'lead',
  },
  spent: { mark: 'we', word: 'wish', dur: 0.5, ease: 'inCubic', track: 'lead' },
  toRise: { mark: 'arose', dur: 0, track: 'shot' },
  onRise: {
    mark: 'arose',
    until: { cue: 'toFree', edge: 'start' },
    ease: 'linear',
    track: 'camera',
  },
  bid: { mark: 'arose', word: 'said', dur: 0.5, ease: 'outCubic', track: 'christ' },
  sit: { mark: 'arose', word: 'arise', dur: 0.4, ease: 'outCubic', track: 'man' },
  stand: { after: 'sit', dur: 0.3, ease: 'outCubic', track: 'man' },
  go: {
    after: 'stand',
    until: { cue: 'toFree', edge: 'start' },
    ease: 'linear',
    track: 'man',
  },
  toFree: { mark: 'arose', word: 'man', offset: -0.08, dur: 0, track: 'shot' },
  onFree: { after: 'toFree', dur: 1, ease: 'inOutSine', track: 'camera' },
  tear: { mark: 'arose', word: 'man', offset: 0.05, dur: 0.5, ease: 'outCubic', track: 'cuffs' },
  step: { mark: 'arose', word: 'arose', dur: 0.6, ease: 'inOutSine', track: 'lead' },
  warm: { mark: 'arose', word: 'arose', offset: 0.15, dur: 0.6, track: 'lead' },
  morning: { mark: 'arose', word: 'arose', dur: 0.7, ease: 'inOutSine', track: 'light' },
} as const;

const knobs = {
  power: [968, 606],
  powerZoom: 1.58,
  court: [768, 560],
  courtZoom: 1.25,
  courtCreep: 1.04,
  command: [764, 617],
  commandZoom: 1.51,
  seedIn: [810, 640],
  seedInZoom: 1.64,
  heart: [505, 640],
  heartZoom: 1.85,
  heartCreep: 1.04,
  room: [768, 470],
  roomZoom: 1.25,
  roomCreep: 1.05,
  we: [680, 660],
  weZoom: 1.7,
  weCreep: 1.05,
  free: [672, 616],
  freeZoom: 1.87,
} as const;

type WithinFrame = Frame<keyof typeof timeline & string, typeof knobs, typeof LANDING_RIGS>;

const fromFeet = (p: Pt): Pt => [p[0] - L.lead[0], p[1] - L.lead[1]];

const toward = (a: Pt, b: Pt, k: number): Pt => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

const readingAt = (p: Pt): Pt => {
  const dx = p[0] - US[0];
  const dy = p[1] - US[1];
  const d = Math.hypot(dx, dy) || 1;
  return [US[0] + (dx / d) * READ, US[1] + (dy / d) * READ];
};

const readingOf = (icon: Icon): Pt =>
  readingAt(fromFeet([icon.at[0] + icon.box.dx, icon.at[1] - icon.box.up]));

const handAt = (f: WithinFrame, p: Pt) =>
  at(f.ctx, { x: p[0], y: p[1] }, () =>
    f.rive('leadHand', { timelines: [['boil', boilTime(f.boil)]], size: L.handScale }),
  );

const reached = (far: Pt, near: Pt) => {
  const arms = reachHands(LN, far, near);
  return [arms.left, arms.right] as const;
};

const rowPose = (f: WithinFrame) => {
  acted(LN, GLAD, [
    [READING, f.at('toBlade')],
    [GLAD, f.at('glad')],
  ]);
  const gaze = toward(readingOf(ICONS[1]), readingOf(ICONS[2]), f.at('toBlade'));
  LN.gazeX = gaze[0];
  LN.gazeY = gaze[1];
  LN.lean = 0;
  LN.tilt = LIFT + SWAY * Math.sin(f.t * 0.7);
  LN.nod = 0;
  LN.stain = PLAIN;
};

const him = (f: WithinFrame, under: () => void, over: () => void) => {
  const { ctx } = f;
  const [fx, fy] = L.lead;
  const hands = reached(L.hands.far, L.hands.near);
  cast(ctx, fx - 46, fx + 46, fy, LEAD.height, 0.6);
  contact(ctx, fx, fy + 2, 95);
  under();
  at(ctx, { x: fx, y: fy }, () =>
    f.rive('lead', { timelines: living(f, BREATH.period, BREATH.offset), numbers: LN }),
  );
  over();
  for (const p of hands) handAt(f, onHim(p, 0));
};

const MORNING = { shafts: 0.7, from: [0.02, 0.02], reach: 0.95, gold: 0.3 } as const;

const onPage = (f: WithinFrame, cam: Camera, draw: () => void, morning = 0) => {
  const { ctx, w, h } = f;
  piece(ctx, rounded(w / 2, h / 2, L.sheet.w, L.sheet.h, 0), PAGE, f.handsOf(word)('page'), {
    role: 'scenery',
    kind: 'torn',
    torn: 4,
    shadow: 0,
  });
  shafts(ctx, w, h);
  if (morning > 0) {
    ctx.save();
    ctx.globalAlpha *= MORNING.shafts * morning;
    shafts(ctx, w, h);
    ctx.restore();
    const [fx, fy] = MORNING.from;
    shine(ctx, fx * w, fy * h, MORNING.reach * w, GOLD_GLOW, MORNING.gold * morning);
  }
  camera(ctx, cam, w, h, draw);
};

const rowShadows = (f: WithinFrame) => {
  const { ctx } = f;
  for (const icon of ICONS) {
    const x = icon.at[0] + icon.box.dx;
    cast(ctx, x - icon.foot, x + icon.foot, icon.at[1], icon.box.tall, ICON_SHADE.cast);
    ctx.save();
    ctx.globalAlpha *= ICON_SHADE.foot;
    contact(ctx, x, icon.at[1] + 2, icon.foot);
    ctx.restore();
  }
};

const iconLight = (f: WithinFrame, icon: Icon, scale: number, amount: number) => {
  const { box } = icon;
  const size = Math.sqrt(box.tall * box.wide) * scale;
  shine(
    f.ctx,
    icon.at[0] + box.dx * scale,
    icon.at[1] - box.up * scale,
    ICON_LIGHT.reach * size,
    GOLD_GLOW,
    amount,
  );
};

const dimmed = (f: WithinFrame, icon: Icon, dim: number) => {
  if (dim <= 0) return;
  const { ctx } = f;
  const { box } = icon;
  const x = icon.at[0] + box.dx;
  const y = icon.at[1] - box.up;
  const r = DIM.reach * Math.sqrt(box.tall * box.wide);
  ctx.save();
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, PAGE);
  g.addColorStop(0.7, PAGE);
  g.addColorStop(1, `${PAGE}00`);
  ctx.globalAlpha *= DIM.alpha * dim;
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  ctx.restore();
};

const row = (f: WithinFrame) => {
  const { ctx } = f;
  const dim = f.at('dim');
  const pop = f.keys('pulse', [
    [0, 0],
    [0.35, 1, 'outCubic'],
    [1, 0, 'inOutSine'],
  ]);
  const [faith, cloth, blade] = ICONS;
  iconLight(f, faith, 1, ICON_LIGHT.alpha * (1 - dim));
  faithIcon(ctx, faith.at[0], faith.at[1], 1, SEED);
  dimmed(f, faith, dim);
  iconLight(f, cloth, 1, (ICON_LIGHT.alpha + CLOTH_GLOW) * (1 - dim));
  clothIcon(ctx, cloth.at[0], cloth.at[1], 1);
  dimmed(f, cloth, dim);
  const s = 1 + ICON_LIGHT.pop * pop;
  iconLight(f, blade, s, ICON_LIGHT.alpha + PULSE * pop);
  bladeIcon(ctx, blade.at[0], blade.at[1], s);
};

const rowShot = (f: WithinFrame) => {
  const shot = f.knobsOf(spoke);
  const rowCam = pushOn(knobCamera(shot('row'), shot('rowZoom')), shot('creep'), 1);
  const cam = shotPath(rowCam, [[f.at('onRow'), knobCamera(f.knob('power'), f.knob('powerZoom'))]]);
  rowPose(f);
  onPage(f, cam, () =>
    him(
      f,
      () => rowShadows(f),
      () => row(f),
    ),
  );
};

const COURT_REST: Pt = [768, 512];
const TEMPLE_AIR = { haze: '#f7e0c8', thickness: 1.4 } as const;

const CHRIST_AT = { x: 1010, y: 905, scale: 1.15 } as const;
const CHRIST_HANDS: readonly [Pt, Pt] = [
  [-104, -205],
  [98, -198],
];
const SENDING: Pt = [-150, -250];
const CHRIST_HAND = 1.08;
const KIND: Expression = { ...EASE, browY: -0.8, browTilt: 0.1, mouth: 3 };
const CN: Record<keyof typeof CHRIST_KNOBS, number> = { ...CHRIST_KNOBS };

const WOMAN_BREATH = 1.02;
const WOMAN = {
  x: 560,
  y: 915,
  facing: 0.5,
  away: -0.65,
  lift: 0.35,
  upright: 0.08,
  out: -280,
  steps: 4,
  bob: 7,
  lean: -0.04,
} as const;
const SWING = 10;

const WOMAN_SCALE = heldScale('womanLeft', BAND.woman, CHRIST_AT.scale);

const womanPose = (f: WithinFrame): CamperPose => {
  const home = stand('womanLeft');
  const turn = f.at('turn');
  const walk = f.at('walk');
  const walking = walk > 0 && walk < 1 ? 1 : 0;
  const phase = Math.PI * WOMAN.steps * walk;
  const [left, right] = home.hands;
  return {
    ...home,
    x: lerp(WOMAN.x, WOMAN.out, walk),
    y: WOMAN.y - WOMAN.bob * Math.abs(Math.sin(phase)) * walking,
    scale: WOMAN_SCALE,
    facing: lerp(WOMAN.facing, WOMAN.away, turn),
    lift: lerp(WOMAN.lift, WOMAN.upright, turn),
    lean: WOMAN.lean * walking,
    breath: (f.t * 2 * Math.PI) / CROWD_BREATH.period + WOMAN_BREATH,
    hands: [
      [left[0] + SWING * Math.sin(phase) * walking, left[1]],
      [right[0] - SWING * Math.sin(phase) * walking, right[1]],
    ],
  };
};

const womanFace = (p: CamperPose): Pt => [p.x, p.y - 0.84 * 366 * p.scale];

interface Standing {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

const christHand = (f: WithinFrame, place: Standing, p: Pt) => {
  const { x, y, scale } = place;
  at(f.ctx, { x: x + p[0] * scale, y: y + p[1] * scale, scale }, () =>
    f.rive('christHand', { timelines: [['boil', boilTime(f.boil)]], size: CHRIST_HAND }),
  );
};

const christInCourt = (f: WithinFrame, her: CamperPose) => {
  const { ctx } = f;
  const { x, y, scale } = CHRIST_AT;
  acted(CN, KIND, []);
  const [fx, fy] = womanFace(her);
  CN.gazeX = (fx - x) / scale;
  CN.gazeY = (fy - y) / scale;
  CN.tilt = -0.04 + 0.015 * Math.sin(f.t * 0.7);
  CN.lean = 0;
  CN.nod = 0;
  cast(ctx, x - 76 * scale, x + 76 * scale, y, 0.75 * CHRIST_TALL * scale, 0.32);
  contact(ctx, x, y + 2, 100 * scale);
  at(ctx, { x, y, scale }, () => f.rive('christ', { timelines: living(f, 5, 3.4), numbers: CN }));
  const lift = f.keys('send', [
    [0, 0],
    [0.35, 1, 'outCubic'],
    [1, 0, 'inOutSine'],
  ]);
  christHand(f, CHRIST_AT, toward(CHRIST_HANDS[0], SENDING, lift));
  christHand(f, CHRIST_AT, CHRIST_HANDS[1]);
};

const courtShot = (f: WithinFrame) => {
  const { ctx, w, h } = f;
  const wide = knobCamera(f.knob('court'), f.knob('courtZoom'));
  const cam = shotPath(wide, [[f.at('onCourt'), pushOn(wide, f.knob('courtCreep'), 1)]]);
  const her = womanPose(f);
  multiplane(
    ctx,
    cam,
    w,
    h,
    [
      { z: 1.3, draw: () => templeFar(ctx, f.hand('templeFar')) },
      { z: 1.12, draw: () => templeWall(ctx) },
      {
        z: 1,
        draw: () => {
          templeFloor(ctx);
          christInCourt(f, her);
          campMass(ctx, 'womanLeft', her);
        },
      },
      { z: 0.94, draw: () => templeNear(ctx) },
    ],
    { rest: COURT_REST, haze: TEMPLE_AIR.haze, thickness: TEMPLE_AIR.thickness, drift: 0 },
  );
};

const ONE: TabletsPose = tabletsAt(L.tablets[0], L.tablets[1]);

const TABLET_FOOT = L.tablets[1];
const NEAR_TABLET = L.tablets[0];
const FAR_TABLET = { from: L.tablets[0] + TABLET.w + TABLET.gap, to: 975 } as const;

const GAP_LIGHT = { up: 150, r: 190, amount: 0.85 } as const;

const SEED_DROP = { y: 715, from: 500, size: 120, bob: 3 } as const;
const SEED_GLOW = { falling: 0.9, rest: 0.35, alive: 1.15 } as const;
const CURLED = 0.3;

const DROPPED: OpenSeedPose = {
  x: 0,
  y: 0,
  rot: 0,
  size: SEED_DROP.size,
  open: 0,
  grown: CURLED,
  glow: 0,
  line: 5,
  shown: 0,
};

const apart = (f: WithinFrame) => f.at('part') * (1 - f.at('close'));

const farTablet = (f: WithinFrame) => lerp(FAR_TABLET.from, FAR_TABLET.to, apart(f));

const gapMiddle = (f: WithinFrame) => (NEAR_TABLET + TABLET.w + farTablet(f)) / 2;

const HEART: Pt = [LEAD.stain.x, LEAD.stain.y];
const HEART_AT: Pt = onHim(HEART, 0);
const INSIDE = 0.3;
const HEART_LIGHT = {
  r: 80,
  tint: '#ffc24a',
  warmth: 0.5,
  flat: 0.8,
  glow: 0.35,
  breathe: 0.1,
  period: 2.2,
  lines: 0.25,
} as const;
const CHEST_LINE = {
  width: 4,
  soft: [
    [3.8, 0.16],
    [2.2, 0.32],
  ],
} as const;
const INSIDE_TUNIC = { side: 7, top: 14, hem: 8 } as const;
const TUNIC_INSIDE: ReadonlyArray<Pt> = TUNIC.map(([x, y]) =>
  onHim(
    [
      x - Math.sign(x) * INSIDE_TUNIC.side,
      clamp(y, LEAD.neck + INSIDE_TUNIC.top, LEAD.hem - INSIDE_TUNIC.hem),
    ],
    0,
  ),
);

const lawMiddle = (f: WithinFrame): Pt => [gapMiddle(f), TABLET_FOOT - TABLET.h / 2];

const settledSize = (k: number) => lerp(1, INSIDE, 1 - (1 - k) ** 2);

const settling = (f: WithinFrame, k: number) => {
  if (k <= 0) return;
  const [mx, my] = lawMiddle(f);
  const s = settledSize(k);
  f.ctx.translate(lerp(mx, HEART_AT[0], k), lerp(my, HEART_AT[1], k));
  f.ctx.scale(s, s);
  f.ctx.translate(-mx, -my);
};

const tabletLines = (xs: readonly [number, number]): ReadonlyArray<readonly [Pt, Pt]> => {
  const { lines } = TABLET;
  const half = (lines.length * TABLET.w) / 2 - lines.thick / 2;
  return xs.flatMap((x0) =>
    Array.from({ length: 5 }, (_, k) => {
      const share = lines.first + ((lines.last - lines.first) * k) / 4;
      const y = TABLET_FOOT - TABLET.h + TABLET.h * share;
      const x = x0 + TABLET.w / 2;
      return [
        [x - half, y],
        [x + half, y],
      ] as const;
    }),
  );
};

const bareLines = (f: WithinFrame, s: number, amount: number) => {
  if (amount <= 0) return;
  const { ctx } = f;
  const lines = tabletLines([NEAR_TABLET, farTablet(f)]);
  const width = CHEST_LINE.width / s;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = HEART_LIGHT.tint;
  for (const [wide, much] of CHEST_LINE.soft) {
    ctx.save();
    ctx.globalAlpha *= much * amount;
    ctx.lineWidth = width * wide;
    ctx.beginPath();
    for (const [a, b] of lines) {
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    }
    unprobed(ctx, () => ctx.stroke());
    ctx.restore();
  }
  ctx.restore();
  for (const [a, b] of lines) goldLine(ctx, [a, b], width, amount);
};

const seedNow = (f: WithinFrame) => {
  const drop = f.at('drop');
  const life = f.at('life');
  DROPPED.x = gapMiddle(f);
  DROPPED.y = lerp(SEED_DROP.from, SEED_DROP.y, drop) + SEED_DROP.bob * Math.sin(f.t * 1.6) * drop;
  DROPPED.rot = 0.12 * Math.sin(2 * Math.PI * drop) * (1 - drop);
  DROPPED.shown = f.at('appear') * (1 - f.at('seedIn'));
  DROPPED.open = f.at('open');
  DROPPED.grown = lerp(CURLED, 1, life);
  DROPPED.glow = lerp(lerp(SEED_GLOW.falling, SEED_GLOW.rest, drop), SEED_GLOW.alive, life);
  return DROPPED;
};

const tabletShadows = (f: WithinFrame, x: number, amount: number) => {
  if (amount <= 0) return;
  const { ctx } = f;
  cast(ctx, x, x + TABLET.w, TABLET_FOOT, TABLET.h, 0.6 * amount);
  ctx.save();
  ctx.globalAlpha *= amount;
  contact(ctx, x + TABLET.w / 2, TABLET_FOOT + 2, 0.62 * TABLET.w);
  ctx.restore();
};

const tablet = (f: WithinFrame, x: number, swell: number, stone: number) => {
  const { ctx } = f;
  const y = TABLET_FOOT;
  ONE.x = x;
  ONE.y = y;
  ONE.scale = 1;
  ONE.stone = stone;
  ONE.lit.fill(1);
  ONE.swell = swell;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - 12, y - TABLET.h - 60, TABLET.w + 12 + TABLET.gap / 2, TABLET.h + 120);
  ctx.clip();
  tablets(ctx, ONE);
  ctx.restore();
};

const law = (f: WithinFrame) => {
  const { ctx } = f;
  const settle = f.at('settle');
  const swell = f.keys('kindle', [
    [0, 0],
    [0.4, 1],
    [1, 0.5],
  ]);
  const shadows = 1 - f.at('unshadow');
  const s = seedNow(f);
  tabletShadows(f, NEAR_TABLET, shadows);
  tabletShadows(f, farTablet(f), shadows);
  if (s.shown > 0) {
    ctx.save();
    ctx.globalAlpha *= s.shown * 0.7 * shadows;
    contact(ctx, s.x, TABLET_FOOT + 2, 0.4 * s.size);
    ctx.restore();
  }
  const bare = f.at('bare');
  ctx.save();
  settling(f, settle);
  if (bare < 1) {
    tablet(f, NEAR_TABLET, swell, 1 - bare);
    tablet(f, farTablet(f), swell, 1 - bare);
    shine(
      ctx,
      gapMiddle(f),
      TABLET_FOOT - GAP_LIGHT.up,
      GAP_LIGHT.r,
      GOLD_GLOW,
      GAP_LIGHT.amount * apart(f) * (0.8 + 0.2 * swell),
    );
    if (s.shown > 0) openSeed(ctx, s);
  }
  bareLines(f, settledSize(settle), bare * lerp(0.8, 1, f.at('lines')));
  ctx.restore();
};

const heartGlow = (f: WithinFrame) => {
  const { ctx } = f;
  const lit = f.at('heart');
  const bright = f.at('lines');
  if (lit <= 0) return;
  const wave = HEART_LIGHT.breathe * Math.sin((2 * Math.PI * f.t) / HEART_LIGHT.period);
  const amount = lit * (1 + wave) * (1 + HEART_LIGHT.lines * bright);
  const r = HEART_LIGHT.r * (1 + wave / 2);
  const [hx, hy] = HEART_AT;
  ctx.save();
  ctx.beginPath();
  TUNIC_INSIDE.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.clip();
  ctx.save();
  ctx.globalAlpha *= clamp(HEART_LIGHT.warmth * amount);
  ctx.translate(hx, hy);
  ctx.scale(1, HEART_LIGHT.flat);
  const warm = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  warm.addColorStop(0, HEART_LIGHT.tint);
  warm.addColorStop(1, `${HEART_LIGHT.tint}00`);
  ctx.fillStyle = warm;
  ctx.fillRect(-r, -r, 2 * r, 2 * r);
  ctx.restore();
  shine(ctx, hx, hy, 0.8 * r, GOLD_GLOW, HEART_LIGHT.glow * amount);
  ctx.restore();
};

const lawPose = (f: WithinFrame) => {
  const receive = f.at('receive') * (1 - f.at('warmed'));
  acted(LN, READING, [
    [ASKING, f.at('ask')],
    [SURE, f.at('easy')],
    [READING, f.at('watch')],
    [WONDER, f.at('wonder')],
    [ALIVE, f.at('alive')],
    [RECEIVING, f.at('receive')],
    [WARMED, f.at('warmed')],
  ]);
  const k = f.at('no');
  const shake = Math.sin(2 * Math.PI * SHAKE.times * k) * Math.sin(Math.PI * k);
  const s = seedNow(f);
  let gaze = toward(readingAt(AT_TABLETS), US, f.at('ask'));
  gaze = toward(
    gaze,
    readingAt(fromFeet([gapMiddle(f), TABLET_FOOT - GAP_LIGHT.up])),
    f.at('watch'),
  );
  gaze = toward(gaze, readingAt(fromFeet([s.x, s.y])), f.at('follow'));
  gaze = toward(gaze, AT_CHEST, f.at('receive'));
  gaze = toward(gaze, US, f.at('warmed'));
  LN.gazeX = gaze[0] + SHAKE.gaze * shake;
  LN.gazeY = gaze[1];
  LN.lean = 0;
  LN.tilt = LIFT + SWAY * Math.sin(f.t * 0.7) + SHAKE.tilt * shake;
  LN.nod = BOW.nod * receive;
  LN.gazeY += BOW.down * receive;
  LN.stain = PLAIN;
};

const lawShot = (f: WithinFrame) => {
  const shot = f.knobsOf(word);
  const lawCam = knobCamera(shot('law'), shot('lawZoom'));
  const commandCam = knobCamera(f.knob('command'), f.knob('commandZoom'));
  const heartCam = knobCamera(f.knob('heart'), f.knob('heartZoom'));
  const cam = shotPath(lawCam, [
    [f.at('onLaw'), pushOn(lawCam, shot('creep'), 1)],
    [f.at('toCommand'), commandCam],
    [f.at('onCommand'), knobCamera(f.knob('seedIn'), f.knob('seedInZoom'))],
    [f.at('settle'), heartCam],
    [f.at('onHeart'), pushOn(heartCam, f.knob('heartCreep'), 1)],
  ]);
  lawPose(f);
  const inside = f.at('settle') > 0;
  onPage(f, cam, () =>
    him(
      f,
      () => {
        if (!inside) law(f);
      },
      () => {
        if (!inside) return;
        heartGlow(f);
        law(f);
      },
    ),
  );
};

const VERSE = {
  ref: 'Hebrews 8:10',
  text: 'For this is the covenant that I will make with the house of Israel after those days, saith the Lord; I will put my laws into their mind, and write them in their hearts: and I will be to them a God, and they shall be to me a people:',
  phrase: 'I will put my laws into their mind, and write them in their hearts:',
} as const;
const SAID = 8;
const VERSE_PAGE = { w: 2000, h: 1160, text: { x: 370, y: 370 }, ref: 110 } as const;
const REF_TYPE = {
  family: F.body,
  size: 34,
  weight: 600,
  color: C.inkSoft,
  tracking: 0.08,
} as const;

const saidShare = (ctx: CanvasRenderingContext2D) => {
  const pad = 2 * (VERSE_STYLE.pad?.x ?? VERSE_STYLE.type.size * 0.12);
  const widths = VERSE.phrase
    .split(/\s+/)
    .filter((s) => s.length > 0)
    .map((s) => measure(ctx, s, VERSE_STYLE.type) + pad);
  const total = widths.reduce((sum, x) => sum + x, 0);
  return total > 0 ? widths.slice(0, SAID).reduce((sum, x) => sum + x, 0) / total : 0;
};

const verseShot = (f: WithinFrame): Box | void => {
  const { ctx, w, h } = f;
  const turn = f.at('page');
  if (turn < 1) lawShot(f);
  at(ctx, { x: lerp(VERSE_PAGE.w + 40, 0, turn), y: 0, rot: lerp(0.05, 0, turn) }, () =>
    piece(ctx, rounded(w / 2, h / 2, VERSE_PAGE.w, VERSE_PAGE.h, 0), C.cream, f.hand('versePage'), {
      role: 'scenery',
      kind: 'torn',
      torn: 4,
      shadow: 0,
    }),
  );
  if (turn < 1) return;
  const { x, y } = VERSE_PAGE.text;
  write(ctx, VERSE.ref, x, y - VERSE_PAGE.ref, REF_TYPE, f.hand('ref'), { boil: 0 });
  return verse(
    ctx,
    VERSE,
    VERSE_STYLE,
    { x, y, highlight: lerp(saidShare(ctx), 1, f.at('sweep')) },
    f.hand('verse'),
  );
};

const heartsOnly = (words: ReadonlyArray<CardWord>): ReadonlyArray<CardWord> =>
  words.filter((w) => w.payoff).map((w) => ({ ...w, text: w.text.replace(/[.,:;!?”"]+$/, '') }));

const ROOM_REST: Pt = [768, 470];
const ROOM_AIR = { haze: '#f1d5b2', thickness: 1.64 } as const;
const ROOM_DEPTH = { crowd: 1.2, wall: 1.3 } as const;

const CHRIST_ROOM: Standing = { x: 1130, y: 880, scale: 1.11 };

const MAN_SCALE = heldScale('climber', BAND.man, CHRIST_ROOM.scale);
const MAN = {
  hip: hipOn(727, MAN_SCALE),
  rest: 0.3,
  strained: 0.78,
  head: 0.35,
  hands: [
    [548, 790],
    [652, 792],
  ],
  tremble: { rise: 0.02, rate: 11 },
  sat: 1.42,
  satHands: [
    [668, 786],
    [800, 788],
  ],
} as const;

const STRAINING: ReadonlyArray<Key> = [
  [0, 0],
  [0.7, 1, 'outCubic'],
  [1, 1],
];

const CROWD_BREATH = { period: 4.3, spread: 0.37 } as const;

const BED_LIGHT = { at: [640, 770], r: 260, color: '#fff1d8', amount: 0.26 } as const;

const manPose = (f: WithinFrame): LyingPose => {
  const up = Math.max(
    f.keys('strain', STRAINING) * (1 - f.at('fall')),
    f.keys('again', STRAINING) * (1 - f.at('back')),
  );
  const tremble = MAN.tremble.rise * Math.sin(2 * Math.PI * MAN.tremble.rate * f.t) * up * up;
  const sit = f.at('sit');
  return {
    hip: MAN.hip,
    scale: MAN_SCALE,
    rise: lerp(lerp(MAN.rest, MAN.strained, up) + tremble, MAN.sat, sit),
    head: MAN.head,
    hands: [toward(MAN.hands[0], MAN.satHands[0], sit), toward(MAN.hands[1], MAN.satHands[1], sit)],
    line: 1,
  };
};

const RISEN = {
  at: [690, 905],
  walk: 380,
  facing: -0.55,
  steps: 3,
  bob: 8,
  lean: -0.04,
  low: 0.84,
  roll: { at: [-22, -172], long: 170, thick: 54, tilt: -0.06 },
  hands: [
    [-98, -158],
    [54, -162],
  ],
} as const;

const risenPose = (f: WithinFrame): CamperPose => {
  const go = f.at('go');
  const walking = go > 0 && go < 1 ? 1 : 0;
  const phase = Math.PI * RISEN.steps * go;
  return {
    ...stand('climber'),
    x: lerp(RISEN.at[0], RISEN.at[0] - RISEN.walk, go),
    y: RISEN.at[1] - RISEN.bob * Math.abs(Math.sin(phase)) * walking,
    scale: MAN_SCALE,
    facing: RISEN.facing,
    lean: RISEN.lean * walking,
    breath: (f.t * 2 * Math.PI) / CROWD_BREATH.period,
    hands: RISEN.hands,
  };
};

const risenHeight = (f: WithinFrame) => lerp(RISEN.low, 1, f.at('stand'));

const rollAt = (p: CamperPose, sy: number): Pt => [
  p.x + RISEN.roll.at[0] * p.scale,
  p.y + RISEN.roll.at[1] * p.scale * sy,
];

const rollSize = (p: CamperPose): Pt => [RISEN.roll.long * p.scale, RISEN.roll.thick * p.scale];

const risenHead = (p: CamperPose, sy: number): Pt => {
  const b = bodyOf('climber');
  return [p.x + 0.08 * b.wide * p.facing * p.scale, p.y - (b.tall - b.head / 2) * p.scale * sy];
};

const MASS_INK = 5;

const handsOnPage = (p: CamperPose): Pt[] => {
  const c = Math.cos(p.lean);
  const s = Math.sin(p.lean);
  return p.hands.map(([x, y]): Pt => [
    p.x + p.scale * (x * c - y * s),
    p.y + p.scale * (x * s + y * c),
  ]);
};

const handsOver = (ctx: CanvasRenderingContext2D, who: CamperName, p: CamperPose) => {
  const r = (0.17 * bodyOf(who).wide + MASS_INK) * p.scale;
  ctx.save();
  ctx.beginPath();
  for (const [x, y] of handsOnPage(p)) {
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, 2 * Math.PI);
  }
  ctx.clip();
  campMass(ctx, who, { ...p, ground: false });
  ctx.restore();
};

const risen = (f: WithinFrame, p: CamperPose, sy: number) => {
  const { ctx } = f;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(1, sy);
  ctx.translate(-p.x, -p.y);
  campMass(ctx, 'climber', p);
  ctx.restore();
  const [long, thick] = rollSize(p);
  rollMass(ctx, rollAt(p, sy), long, thick, RISEN.roll.tilt);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(1, sy);
  ctx.translate(-p.x, -p.y);
  handsOver(ctx, 'climber', p);
  ctx.restore();
};

const housePerson = (f: WithinFrame, h: Held, i: number) =>
  campMass(
    f.ctx,
    h.who,
    heldPose(
      h,
      CHRIST_ROOM.scale,
      ((f.t + i * CROWD_BREATH.spread) * 2 * Math.PI) / CROWD_BREATH.period,
    ),
  );

const BEARER_POSES = BEARERS.map((h) => heldPose(h, CHRIST_ROOM.scale, 0));

const bearersInHole = (f: WithinFrame) => {
  const { ctx } = f;
  ctx.save();
  traceHole(ctx);
  ctx.clip();
  BEARERS.forEach((h, i) =>
    campMass(ctx, h.who, { ...(BEARER_POSES[i] ?? stand(h.who)), ground: false }),
  );
  ctx.restore();
};

const bearersHands = (f: WithinFrame) =>
  BEARERS.forEach((h, i) => {
    const p = BEARER_POSES[i];
    if (p !== undefined) handsOver(f.ctx, h.who, p);
  });

const ROPE_SAG = { held: 6, up: 9 } as const;

const ropes = (f: WithinFrame) => {
  const up = f.at('toRise') >= 1;
  ROPES.forEach(([hand, tie], i) =>
    rope(f.ctx, hand, up ? (SLACK[i] ?? tie) : tie, up ? ROPE_SAG.up : ROPE_SAG.held, C.outline),
  );
};

const BIDDING: Pt = [-168, -270];

const christInRoom = (f: WithinFrame, head: Pt) => {
  const { ctx } = f;
  const { x, y, scale } = CHRIST_ROOM;
  acted(CN, KIND, []);
  CN.gazeX = (head[0] - x) / scale;
  CN.gazeY = (head[1] - y) / scale;
  CN.tilt = -0.03 + 0.012 * Math.sin(f.t * 0.7);
  CN.lean = 0;
  CN.nod = 0;
  cast(ctx, x - 76 * scale, x + 76 * scale, y, 0.75 * CHRIST_TALL * scale, 0.32);
  contact(ctx, x, y + 2, 100 * scale);
  at(ctx, { x, y, scale }, () => f.rive('christ', { timelines: living(f, 5, 3.4), numbers: CN }));
  const bid =
    f.at('bid') *
    (1 -
      f.keys('go', [
        [0, 0],
        [0.6, 1, 'inOutSine'],
        [1, 1],
      ]));
  christHand(f, CHRIST_ROOM, toward(CHRIST_HANDS[0], BIDDING, bid));
  christHand(f, CHRIST_ROOM, CHRIST_HANDS[1]);
};

const roomShot = (f: WithinFrame) => {
  const { ctx, w, h } = f;
  const wide = knobCamera(f.knob('room'), f.knob('roomZoom'));
  const creep = f.at('toRise') >= 1 ? f.at('onRise') : f.at('onRoom');
  const cam = shotPath(wide, [[creep, pushOn(wide, f.knob('roomCreep'), 1)]]);
  const man = manPose(f);
  const up = f.at('stand');
  const stood = risenPose(f);
  const sy = risenHeight(f);
  multiplane(
    ctx,
    cam,
    w,
    h,
    [
      {
        z: ROOM_DEPTH.wall,
        draw: () => {
          roomWall(ctx);
          roomFloor(ctx);
        },
      },
      { z: ROOM_DEPTH.crowd, draw: () => CROWD.forEach((p, i) => housePerson(f, p, i)) },
      {
        z: 1,
        draw: () => {
          holeSky(ctx, f.hand('holeSky'));
          bearersInHole(f);
          roomCeiling(ctx);
          holeShafts(ctx);
          SIDES.forEach((p, i) => housePerson(f, p, i + CROWD.length));
          ropes(f);
          bearersHands(f);
          bedShadow(ctx, C.outline, 1 - up);
          bedGathered(ctx, up, rollAt(stood, sy), rollSize(stood));
          if (up <= 0) lyingMass(ctx, man);
          shine(
            ctx,
            BED_LIGHT.at[0],
            BED_LIGHT.at[1],
            BED_LIGHT.r,
            BED_LIGHT.color,
            BED_LIGHT.amount,
          );
          if (up > 0) risen(f, stood, sy);
          christInRoom(f, up > 0 ? risenHead(stood, sy) : lyingHead(man));
        },
      },
      { z: 0.86, draw: () => NEAR.forEach((p, i) => housePerson(f, p, i + 3)) },
    ],
    { rest: ROOM_REST, haze: ROOM_AIR.haze, thickness: ROOM_AIR.thickness, drift: 0 },
  );
};

const STRAIN = { lean: 0.17, tilt: 0.08, tremble: 0.014, rate: 9 } as const;
const PRESSING = { far: [-65, -149], near: [69, -150] } as const;
const AT_FEET: Pt = [24, -40];
const AHEAD: Pt = [190, -300];
const UP_AHEAD: Pt = [300, -480];
const STEP = { on: 80, hop: 14, lean: 0.07, swing: 12 } as const;

const HELD: Expression = { ...EASE, browY: -0.6, browTilt: 0.32, eyes: 1, mouth: -0.5 };
const STRIVING: Expression = {
  ...EASE,
  browY: 2.2,
  browTilt: -0.3,
  eyes: 0.2,
  eyeW: 1.15,
  mouth: -0.9,
};
const SPENT: Expression = { ...EASE, browY: -0.4, browTilt: 0.42, eyes: 0.88, mouth: -0.9 };
const FREED: Expression = { ...EASE, browY: -2.3, browTilt: 0.2, eyes: 1.18, mouth: 0.5 };

const strainNow = (f: WithinFrame) =>
  Math.max(
    f.keys('pull', STRAINING) * (1 - f.at('slip')),
    f.keys('pullAgain', STRAINING) * (1 - f.at('spent')),
  );

const stepNow = (f: WithinFrame): Pt => {
  const k = f.at('step');
  return [STEP.on * k, -STEP.hop * Math.sin(Math.PI * k)];
};

const fastPose = (f: WithinFrame) => {
  const up = strainNow(f);
  const warm = f.at('warm');
  acted(LN, HELD, [
    [STRIVING, up],
    [SPENT, f.at('spent')],
    [FREED, f.at('tear')],
    [WARMED, warm],
  ]);
  let gaze = toward(AT_FEET, AHEAD, up);
  gaze = toward(gaze, UP_AHEAD, warm);
  LN.gazeX = gaze[0];
  LN.gazeY = gaze[1];
  const tremble = STRAIN.tremble * Math.sin(2 * Math.PI * STRAIN.rate * f.t) * up * up;
  LN.lean = STRAIN.lean * up + tremble + STEP.lean * Math.sin(Math.PI * f.at('step'));
  LN.tilt = STRAIN.tilt * up + LIFT * warm + SWAY * Math.sin(f.t * 0.7);
  const bowed = 1 - Math.max(up, warm);
  LN.nod = BOW.nod * bowed;
  LN.gazeY += BOW.down * bowed;
  LN.stain = PLAIN;
};

const leanedOn = (side: Pt, lean: number): Pt => fromFeet(onHim(side, lean));

const heldFast = (f: WithinFrame) => {
  const { ctx } = f;
  const [fx, fy] = L.lead;
  const off = stepNow(f);
  const x = fx + off[0];
  const up = strainNow(f);
  const swing = STEP.swing * Math.sin(Math.PI * f.at('step'));
  const far = toward(L.hands.far, PRESSING.far, up);
  const near = toward(L.hands.near, PRESSING.near, up);
  const hands = reached(
    leanedOn([far[0] - swing, far[1]], LN.lean),
    leanedOn([near[0] + swing, near[1]], LN.lean),
  );
  cast(ctx, x - 46, x + 46, fy, LEAD.height, 0.6);
  contact(ctx, x, fy + 2, 95 * (1 + off[1] / (4 * STEP.hop)));
  at(ctx, { x, y: fy + off[1] }, () =>
    f.rive('lead', { timelines: living(f, BREATH.period, BREATH.offset), numbers: LN }),
  );
  hold(ctx, L.lead, f.at('tear'), f.hand('hold'));
  for (const p of hands) handAt(f, onHim([p[0] + off[0], p[1] + off[1]], 0));
};

const fastShot = (f: WithinFrame) => {
  const held = knobCamera(f.knob('we'), f.knob('weZoom'));
  const cam = shotPath(held, [
    [f.at('onWe'), pushOn(held, f.knob('weCreep'), 1)],
    [f.at('onFree'), knobCamera(f.knob('free'), f.knob('freeZoom'))],
  ]);
  fastPose(f);
  onPage(f, cam, () => heldFast(f), f.at('morning'));
};

const pageLight = (f: WithinFrame): Light => {
  const off = f.at('page') * (1 - f.at('toRoom'));
  return {
    ...L.light,
    amount: (L.light.amount ?? 1) * (1 - off),
    vignette: (L.light.vignette ?? 1) * (1 - off),
  };
};

export const within = drawing({
  timeline,
  knobs,
  rigs: LANDING_RIGS,
  light: pageLight,
  draw: (f): Box | void => {
    if (f.at('toFree') >= 1) return fastShot(f);
    if (f.at('toRise') >= 1) return roomShot(f);
    if (f.at('toWe') >= 1) return fastShot(f);
    if (f.at('toRoom') >= 1) return roomShot(f);
    if (f.at('page') > 0) return verseShot(f);
    if (f.at('toLaw') >= 1) lawShot(f);
    else if (f.at('toCourt') >= 1) courtShot(f);
    else rowShot(f);
  },
  cards: [
    {
      cue: 'card',
      from: 'write',
      to: 'bed',
      payoff: 'hearts',
      flood: { cue: 'flood' },
      draw: (f, words) => fullCard(f, heartsOnly(words), CARD_STYLE),
    },
  ],
});
