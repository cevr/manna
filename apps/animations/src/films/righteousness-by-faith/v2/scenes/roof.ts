import {
  type Camera,
  type Frame,
  type Pt,
  camera,
  drawing,
  knobCamera,
  pushOn,
  pushInto,
  shotPath,
  stroke,
  type Posed,
  glow,
  reset,
  UNMOVED,
} from '@manna/film/canvas';
import { clamp, lerp, gait } from '@manna/film/core';
import { type House, WENT, house } from '../../gospel.ts';
import { C, type Hands, ICON_KEPT, ICON_LEAD, ICON_X, type Three, iconScratch } from '../../kit.ts';
import { GIFTS_AT, GIFTS_S, TAKEN, giftHand, giftRow, message } from './message.ts';

const timeline = {
  open: { mark: 'see', dur: 0.4 },
  through: { mark: 'see', dur: 1.1, ease: 'inCubic' },
  up: { mark: 'roof', dur: 0.9, ease: 'inOutSine' },
  tiles: { mark: 'roof', offset: 0.3, dur: 0.8 },
  grasp: { with: 'lower', dur: 0.5, ends: true },
  lower: { mark: 'roof', word: 'lower', until: 'saw', ease: 'inOutSine' },
  look: { mark: 'saw', dur: 0.6, ease: 'inOutSine' },
  push: { mark: 'son', dur: 0.6, ends: true, ease: 'inOutCubic' },
  reach: { mark: 'son', dur: 0.6 },
  specks: { mark: 'son', word: 'sins', dur: 1.2, ease: 'inOutSine' },
  glad: { after: 'specks', dur: 0.6 },
  rack: { mark: 'scribes', offset: -0.3, dur: 1, ease: 'inOutCubic' },
  doubt: { mark: 'scribes', offset: 0.4, dur: 1.2 },
  easy: { mark: 'easy', offset: -0.2, dur: 1, ease: 'inOutCubic' },
  back: { mark: 'arise', dur: 0.9, ease: 'inOutCubic' },
  rise: { mark: 'arise', offset: 0.1, dur: 0.9, ease: 'inOutSine' },
  letGo: { with: 'rise', dur: 0.3 },
  withdraw: { with: 'rise', dur: 0.6 },
  wonder: { mark: 'arise', offset: 0.3, dur: 0.8 },
  roll: { mark: 'arise', word: 'bed', dur: 0.8, ease: 'inOutSine' },
  steady: { with: 'roll', until: { cue: 'roll' } },
  walk: { mark: 'went', until: 'count', ease: 'linear' },
  follow: { mark: 'went', dur: 1.4, ease: 'inOutSine' },
  band: { mark: 'count', dur: 0.6, ease: 'outCubic' },
  oneLit: { mark: 'one', dur: 0.55, ease: 'outBack' },
  oneHold: { mark: 'one', until: 'two', ease: 'linear' },
  twoLit: { mark: 'two', dur: 0.55, ease: 'outBack' },
  twoSpecks: { mark: 'two', word: 'forgiveness', dur: 1.2, ease: 'inOutSine' },
  twoHold: { mark: 'two', until: 'three', ease: 'linear' },
  threeLit: { mark: 'three', dur: 0.55, ease: 'outBack' },
  threeWalk: { mark: 'three', until: 'proof', ease: 'linear' },
  heart: { mark: 'three', offset: 0.2, dur: 0.8, ease: 'outCubic' },
  proof: { mark: 'proof', dur: 1.2, ease: 'inOutSine' },
  proofWalk: { mark: 'proof', dur: 1.6, ease: 'linear' },
} as const;

const knobs = {
  wide: [960, 560],
  wideZoom: 1,
  up: [760, 330],
  upZoom: 1.5,
  room: [820, 650],
  roomZoom: 1.2,
  saw: [990, 520],
  sawZoom: 1.25,
  scribes: [1420, 560],
  scribesZoom: 2.4,
  manFace: [600, 808],
  manFaceZoom: 3.4,
  lying: [690, 780],
  lyingZoom: 2.2,
  arise: [720, 690],
  ariseZoom: 1.7,
  band: [960, 262],
  pushOn: 1.12,
} as const;

type RoofFrame = Frame<keyof typeof timeline & string, typeof knobs>;

const FAITH: Camera = {
  x: GIFTS_AT.gifts[0] + ICON_X[0] * GIFTS_S,
  y: GIFTS_AT.gifts[1],
  zoom: 14,
};
const WINDOW_R = 140;
export const BAND_S = 0.32;
const BAND_ABOVE = -120;

const { lit: LIT, lead: LEAD, count: COUNT } = iconScratch();
const ALL: readonly [number, number, number] = [1, 1, 1];

export const counted = (
  lit: [number, number, number],
  lead: [number, number, number],
  [one, two, three]: Three,
) => {
  lit[0] = clamp(one) * lerp(1, ICON_KEPT, clamp(two));
  lit[1] = clamp(two) * lerp(1, ICON_KEPT, clamp(three));
  lit[2] = clamp(three);
  lead[0] = one * (1 - clamp(two));
  lead[1] = two * (1 - clamp(three));
  lead[2] = three;
};
const CAPERNAUM: Posed<House> = {
  cam: WENT,
  tiles: 0,
  lower: 0,
  ropes: 0,
  lookUp: 0,
  reach: 0,
  lookAfter: 0,
  specks: 0,
  rise: 0,
  roll: 0,
  steady: 0,
  walk: 0,
  bob: 0,
  glad: 0,
  wonder: 0,
  doubt: 0,
  holeLit: 0,
  robed: 0,
  heart: 0,
};

export const roof = drawing({
  timeline,
  knobs,
  draw: (f) => {
    if (f.at('through') < 1) opening(f, f.handsOf(message));
    else if (f.t < f.mark('one')) capernaum(f);
    else replay(f);
    band(f);
  },
});

const opening = (f: RoofFrame, hands: Hands) => {
  const { ctx, w, h } = f;
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, w, h);
  const cam = shotPath(UNMOVED, [[f.at('through'), FAITH, pushInto]]);
  camera(ctx, cam, w, h, () => {
    giftHand(ctx, hands, GIFTS_AT.palm, 1, TAKEN);
    giftRow(ctx, hands, GIFTS_AT.gifts, ALL, ALL);
  });
  const open = f.at('open');
  if (open <= 0) return;
  const zoom = cam.zoom ?? 1;
  ctx.save();
  ctx.beginPath();
  ctx.arc(
    w / 2 + (FAITH.x - cam.x) * zoom,
    h / 2 + (FAITH.y - cam.y) * zoom,
    WINDOW_R * GIFTS_S * zoom,
    0,
    Math.PI * 2,
  );
  ctx.clip();
  ctx.globalAlpha *= open;
  capernaum(f);
  ctx.restore();
};

const capernaum = (f: RoofFrame) => {
  const { ctx, w, h, t } = f;
  const s = CAPERNAUM;
  s.cam = shotPath(knobCamera(f.knob('wide'), f.knob('wideZoom')), [
    [f.at('up'), knobCamera(f.knob('up'), f.knob('upZoom'))],
    [f.at('lower'), knobCamera(f.knob('room'), f.knob('roomZoom'))],
    [f.at('look'), knobCamera(f.knob('saw'), f.knob('sawZoom'))],
    [f.at('push'), knobCamera(f.knob('manFace'), f.knob('manFaceZoom'))],
    [f.at('rack'), knobCamera(f.knob('scribes'), f.knob('scribesZoom'))],
    [f.at('easy'), knobCamera(f.knob('lying'), f.knob('lyingZoom'))],
    [f.at('back'), knobCamera(f.knob('arise'), f.knob('ariseZoom'))],
    [f.at('follow'), WENT],
  ]);
  s.tiles = f.at('tiles');
  s.lower = f.at('lower');
  s.lookUp = f.at('look');
  s.ropes = f.at('grasp') * (1 - f.at('letGo'));
  s.reach = f.at('reach') * (1 - f.at('withdraw'));
  s.lookAfter = f.at('rise');
  s.specks = f.at('specks');
  s.rise = f.at('rise');
  s.roll = f.at('roll');
  s.steady = f.at('steady');
  s.walk = f.at('walk');
  s.bob = gait(t, f.cue('walk'));
  s.glad = f.at('glad');
  s.wonder = f.at('wonder');
  s.doubt = f.at('doubt');
  s.holeLit = 0;
  s.robed = 0;
  s.heart = 0;
  house(ctx, w, h, f.hand, s);
};

const LET_DOWN: Omit<House, 'cam'> = {
  tiles: 1,
  lower: 1,
  ropes: 1,
  lookUp: 1,
  reach: 0,
  lookAfter: 0,
  specks: 0,
  rise: 0,
  roll: 0,
  steady: 0,
  walk: 0,
  bob: 0,
  glad: 0,
  wonder: 0,
  doubt: 0,
  holeLit: 0,
  robed: 0,
  heart: 0,
};

const replay = (f: RoofFrame) => {
  const { ctx, w, h, t } = f;
  const s = CAPERNAUM;
  reset(s, LET_DOWN);
  if (t < f.mark('two')) {
    s.holeLit = f.at('oneLit');
    s.cam = pushOn(knobCamera(f.knob('up'), f.knob('upZoom')), f.knob('pushOn'), f.at('oneHold'));
  } else if (t < f.mark('three')) {
    s.reach = 1;
    s.specks = f.at('twoSpecks');
    s.robed = f.at('twoSpecks');
    s.glad = clamp(2 * s.specks - 1);
    s.cam = pushOn(
      knobCamera(f.knob('manFace'), f.knob('manFaceZoom')),
      f.knob('pushOn'),
      f.at('twoHold'),
    );
  } else {
    s.robed = 1;
    s.heart = f.at('heart');
    s.ropes = 0;
    s.lookAfter = 1;
    s.specks = 1;
    s.rise = 1;
    s.roll = 1;
    s.steady = 1;
    s.glad = 1;
    s.wonder = 1;
    s.doubt = 1;
    const out = t < f.mark('proof') ? f.at('threeWalk') : 1;
    s.walk = lerp(0.1, 0.6, out) + 0.3 * f.at('proofWalk');
    s.bob = gait(t, f.cue('threeWalk')) + gait(t, f.cue('proofWalk'));
    s.cam = WENT;
  }
  house(ctx, w, h, f.hand, s);
};

const band = (f: RoofFrame) => {
  const shown = f.at('band');
  if (shown <= 0) return;
  const { ctx } = f;
  counted(LIT, LEAD, [f.at('oneLit'), f.at('twoLit'), f.at('threeLit')]);
  COUNT.dim = shown;
  const [bx, by] = f.knob('band');
  const at: Pt = [bx, lerp(BAND_ABOVE, by, shown)];
  giftRow(ctx, f.hand, at, LIT, ALL, BAND_S, COUNT);
  const proof = f.at('proof');
  if (proof <= 0) return;
  const rim = 150 * BAND_S;
  const from = at[0] + ICON_X[2] * BAND_S - rim * (1 + ICON_LEAD * clamp(LEAD[2]));
  const x = lerp(from, at[0] + ICON_X[1] * BAND_S + rim, proof);
  glow(ctx, x, at[1], 40, C.glow, 0.9 * (1 - 0.5 * proof));
  stroke(
    ctx,
    [
      [from, at[1]],
      [x, at[1]],
    ],
    { color: C.gold, width: 5, jitter: 0.3, taper: 0.2, boil: 'crawl' },
    f.hand('proof'),
  );
};
