import {
  type Camera,
  type Frame,
  type Pt,
  drawing,
  knobCamera,
  pushOn,
  shotPath,
  type Posed,
  reset,
  sky,
} from '@manna/film/canvas';
import { lerp, gait } from '@manna/film/core';
import { COURT_GONE, COURT_WIDE, GONE_LOOK, type Temple, temple } from '../../gospel.ts';
import { ICON_ROW, ICON_SKY, iconScratch } from '../../kit.ts';
import { giftRow } from './message.ts';
import { BAND_S, counted, roof } from './roof.ts';

const timeline = {
  charge: { mark: 'law', dur: 0.7 },
  chargeDown: { mark: 'first', dur: 0.6 },
  stoop: { mark: 'dust', offset: -0.2, dur: 0.9, ease: 'inOutSine' },
  pen: { mark: 'dust', offset: 0.5, dur: 0.5 },
  writing: { mark: 'dust', offset: 0.8, until: 'first', ease: 'linear' },
  straighten: { mark: 'first', dur: 0.9, ease: 'inOutSine' },
  drop: { mark: 'leave', offset: -0.2, until: 'alone', ease: 'linear' },
  leave: { mark: 'leave', offset: 0.3, until: 'none', ease: 'linear' },
  toCharge: { mark: 'law', offset: -0.3, dur: 1, ease: 'inOutCubic' },
  toDust: { mark: 'dust', offset: -0.3, dur: 1, ease: 'inOutCubic' },
  toWide: { mark: 'first', offset: -0.2, dur: 1, ease: 'inOutCubic' },
  courtPush: { mark: 'alone', until: 'lord', ease: 'inOutSine' },
  asks: { mark: 'none', until: 'lord', ease: 'linear' },
  raise: { mark: 'none', dur: 0.8 },
  herFace: { mark: 'lord', dur: 0.8, ends: true, ease: 'inOutCubic' },
  lookUp: { mark: 'lord', dur: 0.6 },
  herPush: { mark: 'lord', until: 'told', ease: 'linear' },
  hisPush: { mark: 'told', until: 'again', ease: 'linear' },
  speaks: { mark: 'told', word: 'Neither', until: 'again', ease: 'linear' },
  sends: { mark: 'told', word: 'Neither', dur: 0.6 },
  sent: { mark: 'again', offset: -0.4, dur: 0.6 },
  wash: { mark: 'told', word: 'go', dur: 0.6 },
  walkOut: { mark: 'told', word: 'go', offset: 0.3, dur: 2.2, ease: 'inQuad' },
  band: { mark: 'again', dur: 0.6, ease: 'outCubic' },
  oneLit: { mark: 'one', dur: 0.55, ease: 'outBack' },
  oneHold: { mark: 'one', until: 'two', ease: 'linear' },
  twoLit: { mark: 'two', dur: 0.55, ease: 'outBack' },
  twoHold: { mark: 'two', until: 'three', ease: 'linear' },
  threeLit: { mark: 'three', dur: 0.55, ease: 'outBack' },
  threeWalk: { mark: 'three', until: 'order', ease: 'inQuad' },
  faith: { mark: 'one', offset: 0.1, dur: 0.8, ease: 'outCubic' },
  heart: { mark: 'three', offset: 0.2, dur: 0.8, ease: 'outCubic' },
  toIdea: { mark: 'order', dur: 1.3, ease: 'inOutCubic' },
} as const;

const knobs = {
  charge: [760, 560],
  chargeZoom: 1.3,
  dust: [1150, 720],
  dustZoom: 1.6,
  twoShot: [980, 620],
  twoShotZoom: 1.18,
  herFace: [650, 505],
  herFaceZoom: 2.3,
  hisFace: [1310, 522],
  hisFaceZoom: 2.3,
  pushOn: 1.18,
} as const;

type WomanFrame = Frame<keyof typeof timeline & string, typeof knobs>;

const BAND_ABOVE = -120;

const { lit: LIT, lead: LEAD, count: COUNT } = iconScratch();
const ALL: readonly [number, number, number] = [1, 1, 1];
const LOOK: [number, number] = [0, 0];
const HER_LOOK: [number, number] = [0, 0];
const WOMAN: Posed<Temple['woman']> = {
  walk: 0,
  bob: 0,
  washed: 0,
  look: HER_LOOK,
  bowed: 1,
  glad: 0,
  white: 0,
  faith: 0,
  heart: 0,
};
const COURT: Posed<Temple> = {
  cam: COURT_WIDE,
  charge: 0,
  drop: 0,
  leave: 0,
  leaveBob: 0,
  writing: 0,
  writes: 0,
  sends: 0,
  stand: 1,
  speak: 0,
  look: LOOK,
  woman: WOMAN,
};

export const woman = drawing({
  timeline,
  knobs,
  draw: (f) => {
    const toIdea = f.at('toIdea');
    if (toIdea < 1) {
      if (f.t < f.mark('one')) court(f);
      else replay(f);
    }
    row(f, toIdea);
  },
});

const talking = (k: number) => Math.min(1, 4 * Math.min(k, 1 - k));

const shot = (f: WomanFrame): Camera => {
  if (f.t >= f.cue('wash').start) return COURT_WIDE;
  if (f.t >= f.mark('told'))
    return pushOn(
      knobCamera(f.knob('hisFace'), f.knob('hisFaceZoom')),
      f.knob('pushOn'),
      f.at('hisPush'),
    );
  return shotPath(COURT_WIDE, [
    [f.at('toCharge'), knobCamera(f.knob('charge'), f.knob('chargeZoom'))],
    [f.at('toDust'), knobCamera(f.knob('dust'), f.knob('dustZoom'))],
    [f.at('toWide'), COURT_WIDE],
    [f.at('courtPush'), knobCamera(f.knob('twoShot'), f.knob('twoShotZoom'))],
    [
      f.at('herFace'),
      pushOn(
        knobCamera(f.knob('herFace'), f.knob('herFaceZoom')),
        f.knob('pushOn'),
        f.at('herPush'),
      ),
    ],
  ]);
};

const court = (f: WomanFrame) => {
  const { ctx, w, h, t } = f;
  const cam = shot(f);
  const stand = 1 - f.at('stoop') + f.at('straighten');
  const talk = Math.max(talking(f.at('asks')), talking(f.at('speaks')));
  const writing = f.at('pen') * (1 - f.at('straighten'));
  LOOK[0] = lerp(-3, -4, stand);
  LOOK[1] = lerp(4, 0.5, stand);
  const raise = f.at('raise');
  const up = f.at('lookUp');
  const walk = f.at('walkOut');
  HER_LOOK[0] = lerp(lerp(1, 3, up), -4, walk);
  HER_LOOK[1] = lerp(lerp(3, 0, raise), -3, up) * (1 - walk);
  COURT.cam = cam;
  COURT.charge = f.at('charge') * (1 - f.at('chargeDown'));
  COURT.drop = f.at('drop');
  COURT.leave = f.at('leave');
  COURT.leaveBob = gait(t, f.cue('leave'));
  COURT.writing = f.at('writing');
  COURT.stand = stand;
  COURT.writes = writing;
  COURT.sends = f.at('sends') * (1 - f.at('sent'));
  COURT.speak = 0.4 * talk * Math.abs(Math.sin(t * 8));
  WOMAN.walk = walk;
  WOMAN.bob = gait(t, f.cue('walkOut'));
  WOMAN.washed = f.at('wash');
  WOMAN.bowed = 1 - 0.5 * raise - 0.5 * up;
  WOMAN.glad = f.at('wash');
  WOMAN.faith = 0;
  WOMAN.heart = 0;
  temple(ctx, w, h, f.hand, COURT);
};

const replay = (f: WomanFrame) => {
  const { ctx, w, h, t } = f;
  reset(COURT, COURT_GONE);
  LOOK[0] = GONE_LOOK[0];
  LOOK[1] = GONE_LOOK[1];
  WOMAN.walk = 0;
  WOMAN.bob = 0;
  WOMAN.faith = 0;
  WOMAN.heart = 0;
  if (t < f.mark('two')) {
    HER_LOOK[0] = 3;
    HER_LOOK[1] = -3;
    WOMAN.washed = 0;
    WOMAN.bowed = 0;
    WOMAN.glad = 0;
    WOMAN.faith = f.at('faith');
    COURT.cam = pushOn(
      knobCamera(f.knob('herFace'), f.knob('herFaceZoom')),
      f.knob('pushOn'),
      f.at('oneHold'),
    );
  } else if (t < f.mark('three')) {
    COURT.sends = 1;
    COURT.speak = 0.4 * talking(f.at('twoHold')) * Math.abs(Math.sin(t * 8));
    COURT.cam = pushOn(
      knobCamera(f.knob('hisFace'), f.knob('hisFaceZoom')),
      f.knob('pushOn'),
      f.at('twoHold'),
    );
  } else {
    const walk = f.at('threeWalk');
    HER_LOOK[0] = -4;
    HER_LOOK[1] = 0;
    WOMAN.washed = 1;
    WOMAN.bowed = 0;
    WOMAN.glad = 1;
    WOMAN.walk = walk;
    WOMAN.bob = gait(t, f.cue('threeWalk'));
    WOMAN.heart = f.at('heart');
    COURT.cam = COURT_WIDE;
  }
  temple(ctx, w, h, f.hand, COURT);
};

const row = (f: WomanFrame, toIdea: number) => {
  const { ctx, w, h } = f;
  const shown = f.at('band');
  if (toIdea > 0) {
    ctx.save();
    ctx.globalAlpha *= toIdea;
    sky(ctx, w, h, ICON_SKY);
    ctx.restore();
  }
  if (shown <= 0) return;
  counted(LIT, LEAD, [f.at('oneLit'), f.at('twoLit'), f.at('threeLit')]);
  for (let i = 0; i < 3; i++) {
    LIT[i] = lerp(LIT[i] ?? 0, 1, toIdea);
    LEAD[i] = (LEAD[i] ?? 0) * (1 - toIdea);
  }
  COUNT.dim = shown * (1 - toIdea);
  const [bx, by] = f.knobsOf(roof)('band');
  const at: Pt = [
    lerp(bx, ICON_ROW.x, toIdea),
    lerp(lerp(BAND_ABOVE, by, shown), ICON_ROW.y, toIdea),
  ];
  giftRow(ctx, f.hand, at, LIT, ALL, lerp(BAND_S, ICON_ROW.scale, toIdea), COUNT);
};
