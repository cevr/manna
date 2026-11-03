import {
  type Camera,
  drawing,
  probePlate,
  rectShape,
  shotPath,
  write,
  glow,
  knobCamera,
} from '@manna/film/canvas';
import { lerp } from '@manna/film/core';
import { C, F, piece } from '../../kit.ts';
import { ROOF, landingSky, rooftop } from '../../city.ts';
import {
  ADVOCATE_POSE,
  FIGURE_LANDED,
  GAVEL_DOWN,
  GAVEL_REST,
  WIDE,
  QUESTION_AT,
  landingCourt,
} from '../../court.ts';

/** Where the camera enters the city: close on the rooftop (derived from the roof, so not a knob). */
const ROOFTOP: Camera = { x: ROOF.x - 20, y: ROOF.top - 70, zoom: 3.4 };

const ANSWER = 'THE LORD OUR RIGHTEOUSNESS';
/** The answer's plate, over the place the question stood. */
const PLATE = rectShape(210, QUESTION_AT[1] - 88, 1500, 116);
const answerStyle = {
  family: F.display,
  size: 84,
  weight: 700,
  color: C.ink,
  align: 'center',
  tracking: 0.04,
} as const;

export const thesis = drawing({
  timeline: {
    lookUp: { at: 'speech', dur: 0.5 },
    answer: { at: 'speech', dur: 1.6, ease: 'linear' },
    answerIn: { with: 'answer', dur: 0.4, ease: 'linear' },
    gavel: { at: 'start', dur: 2, ease: 'linear' },
    letGo: { after: 'gavel', dur: 0.5 },
    textOut: { at: 'speechEnd', offset: 7.9, dur: 1.2 },
    away: { with: 'textOut', offset: 0.6, dur: 4.5, ease: 'inOutSine' },
    courtOut: { with: 'away', offset: 1.66, dur: 0.88, ease: 'linear' },
    cityIn: { after: 'courtOut', offset: -0.15, dur: 2.11, ease: 'outQuad' },
    city: { with: 'cityIn', offset: 0.21, dur: 11, ease: 'inOutSine' },
    turn: { after: 'city', offset: 1.3, dur: 1.2 },
  },
  knobs: {
    city: [1200, 640],
    cityZoom: 1.3,
    courtBack: [930, 400],
    courtBackZoom: 0.92,
  },
  draw: (f) => {
    const { ctx, w, h } = f;
    landingSky(ctx, w, h);
    glow(ctx, 960, 380, 750, C.glow, 0.55);

    const away = f.at('away');
    const city = f.at('city');
    const turn = f.at('turn');
    const courtOut = f.at('courtOut');
    const cityIn = f.at('cityIn');

    if (cityIn > 0) {
      ctx.save();
      ctx.globalAlpha *= cityIn;
      const cam = shotPath(ROOFTOP, [[city, knobCamera(f.knob('city'), f.knob('cityZoom'))]]);
      rooftop(ctx, w, h, (k) => f.hand(k), cam, turn);
      ctx.restore();
    }

    if (courtOut < 1) {
      const lookUp = f.at('lookUp');
      ctx.save();
      ctx.globalAlpha *= 1 - courtOut;
      landingCourt(ctx, w, h, (k) => f.hand(k), {
        cam: shotPath(WIDE, [[away, knobCamera(f.knob('courtBack'), f.knob('courtBackZoom'))]]),
        drift: 0,
        swing: GAVEL_DOWN - (GAVEL_DOWN - GAVEL_REST) * f.at('gavel'),
        held: 1 - f.at('letGo'),
        stamp: 0,
        pop: 1,
        gold: 1,
        shine: 0.9,
        figure: {
          look: [lerp(FIGURE_LANDED.look[0], 2, lookUp), lerp(FIGURE_LANDED.look[1], -4, lookUp)],
          browL: lerp(FIGURE_LANDED.browL, 3, lookUp),
          browR: lerp(FIGURE_LANDED.browR, 4, lookUp),
          browTilt: 0.35 * lookUp,
          tilt: lerp(FIGURE_LANDED.tilt, -0.1, lookUp),
          smile: FIGURE_LANDED.smile,
        },
        advocate: { ...ADVOCATE_POSE, tilt: -0.06, look: [3, 1], smile: 0.6 },
      });
      ctx.restore();
    }

    const out = f.at('textOut');
    const answer = f.at('answer');
    if (out < 1 && answer > 0) {
      ctx.save();
      ctx.globalAlpha *= f.at('answerIn') * (1 - out);
      piece(ctx, PLATE, C.cream, f.hand('plate'), {
        role: 'scenery',
        kind: 'cut',
        line: 5,
        outline: C.gold,
        torn: 2,
        shadow: 0.4,
      });
      probePlate(ctx, PLATE, () =>
        write(ctx, ANSWER, QUESTION_AT[0], QUESTION_AT[1], answerStyle, f.hand('answer'), {
          progress: answer,
          reveal: 'write',
          boil: 0.4,
        }),
      );
      ctx.restore();
    }
  },
});
