import {
  type Gesture,
  camera,
  drawing,
  shotPath,
  type Posed,
  knobCamera,
} from '@manna/film/canvas';
import { lerp } from '@manna/film/core';

import { JOSHUA, TUNIC_STAINS, ZECH_REST as REST, courtWall, zechCourt } from '../../court.ts';

/** Christ's hand raised on "angel", palm out beside his head; its reach rewritten each frame (scratch). */
const RAISED: Posed<Gesture> = { to: [-78, -205], reach: 0, grip: 'palm' };

export const accuser = drawing({
  timeline: {
    down: { at: 'start', dur: 3.1, ease: 'inOutSine' },
    bow: { mark: 'joshua', dur: 0.6 },
    push: { mark: 'filthy', offset: -0.2, dur: 0.9, ease: 'inOutCubic' },
    enter: { mark: 'satan', offset: -0.2, dur: 1.2, ease: 'outCubic' },
    toPair: { mark: 'satan', offset: -0.3, dur: 1.1, ease: 'inOutCubic' },
    point: { after: 'enter', dur: 0.5, ease: 'outBack' },
    wide: { mark: 'room', dur: 1, ease: 'inOutCubic' },
    flare: { mark: 'points', dur: 1.5, stagger: 0.8, ease: 'linear' },
    dim: { with: 'flare', offset: 0.9, dur: 2.4, stagger: 0.5, ease: 'linear' },
    up: { mark: 'ew', offset: 0.4, dur: 1.4, ease: 'inOutCubic' },
    sink: { mark: 'day', offset: -0.2, dur: 2.2, ease: 'inOutSine' },
    back: { mark: 'angel', dur: 1, ends: true, ease: 'inOutCubic' },
    raise: { mark: 'angel', offset: 0.1, dur: 0.8, ease: 'inOutSine' },
    drop: { mark: 'silence', dur: 0.6, ease: 'inCubic' },
    shrink: { mark: 'silence', offset: 0.1, dur: 0.8 },
    lower: { mark: 'silence', offset: 0.4, dur: 0.7 },
    lift: { mark: 'silence', offset: 0.1, dur: 0.6 },
    grip: { mark: 'silence', offset: 0.5, dur: 0.8 },
  },
  knobs: {
    high: [1045, 280],
    highZoom: 2.3,
    josh: [760, 660],
    joshZoom: 1.9,
    pair: [560, 640],
    pairZoom: 1.4,
  },
  draw: (f) => {
    const { ctx, w, h } = f;
    const hand = (k: string) => f.hand(k);

    const HIGH = knobCamera(f.knob('high'), f.knob('highZoom'));
    const JOSH = knobCamera(f.knob('josh'), f.knob('joshZoom'));
    const PAIR = knobCamera(f.knob('pair'), f.knob('pairZoom'));
    const cam = shotPath(HIGH, [
      [f.at('down'), REST],
      [f.at('push'), JOSH],
      [f.at('toPair'), PAIR],
      [f.at('wide'), REST],
      [f.at('up'), HIGH],
      [f.at('back'), REST],
    ]);

    const point = f.at('point') * (1 - f.at('drop'));
    const raise = f.at('raise') * (1 - f.at('lower'));
    RAISED.reach = raise;
    const bow = f.at('bow') * (1 - f.at('lift'));
    const stainLit = (i: number) =>
      f.stagger('flare', i, TUNIC_STAINS.length) * (1 - f.stagger('dim', i, TUNIC_STAINS.length));

    courtWall(ctx, w, h);
    camera(ctx, cam, w, h, () =>
      zechCourt(ctx, hand, {
        sun: lerp(-0.6, 0, f.at('sink')),
        accuser: { enter: f.at('enter'), shrink: f.at('shrink'), point },
        angel: {
          lift: raise,
          tilt: -0.05 * raise,
          reach: RAISED,
        },
        joshua: { tilt: 0.1, nod: 7 * bow, look: [0, 3 * bow], browTilt: 0.2 + 0.2 * bow },
        specks: 1,
        cheek: { dy: 7 * bow, alpha: 1 },
        tunic: { at: JOSHUA, flare: stainLit },
        helpers: { grip: f.at('grip'), dx: 0, bob: 0, up: 0 },
      }),
    );
  },
});
