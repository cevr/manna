import { at, drawing, rounded, write } from '@manna/film/canvas';
import { lerp } from '@manna/film/core';
import { COURT_RIGS, courtFigures, courtShadows, restPose } from '../court-cast.ts';
import { widePews, wideRoom } from '../court-set.ts';
import { C, F, piece } from '../kit.ts';
import { LIGHT } from '../light.ts';
import { TITLE } from '../script.ts';

/**
 * The cast in the wide: the Board's pixels scaled to the panel's size of
 * them and moved onto its floor, each group spread off its `cold` place as
 * the panel spreads them (Board pixels).
 */
const CAST = {
  x: 425,
  y: 315,
  scale: 0.6,
  spread: { lead: [0, 0], prosecutor: [98, 27], judge: [258, 60] },
} as const;

/** The film's name: its strip's centre and size on the back wall, frame px, and its type. */
const NAME = {
  x: 990,
  y: 200,
  w: 1000,
  h: 140,
  style: { family: F.display, size: 82, weight: 700, color: C.cream, align: 'center' },
} as const;

/** The court as the panel stages it: the case before the verdict. */
const POSE = (() => {
  const p = restPose();
  p.stack = 1;
  Object.assign(p.lead.numbers, { gazeX: 520, browTilt: 0.3, browY: -1, mouth: -0.6 });
  Object.assign(p.prosecutor.numbers, {
    gazeX: -520,
    browY: 0.6,
    browTilt: -0.34,
    eyes: 1.1,
    mouthLine: 0,
    mouthOpen: 0,
    shout: 0.75,
    lean: -0.05,
    tilt: -0.05,
  });
  p.prosecutor.hands[0] = [598, 430];
  Object.assign(p.judge.numbers, { browY: 1.6, browTilt: -0.3, mouth: -1 });
  return p;
})();

export const title = drawing({
  timeline: {
    pull: { at: 'start', until: { at: 'end' }, ease: 'outCubic' },
    settle: { at: 'start', offset: 0.25, dur: 0.8, ease: 'outCubic' },
  },
  knobs: {
    near: 1.08,
  },
  rigs: COURT_RIGS,
  light: { ...LIGHT.room, vignette: 0.1 },
  draw: (f) => {
    const { ctx, w, h } = f;
    const zoom = lerp(f.knob('near'), 1, f.at('pull'));
    ctx.save();
    ctx.translate(w / 2, h * 0.55);
    ctx.scale((zoom * w) / 1920, (zoom * w) / 1920);
    ctx.translate(-960, -594);
    wideRoom(ctx);
    at(ctx, { x: CAST.x, y: CAST.y, scale: CAST.scale }, () => {
      courtShadows(ctx, CAST.spread);
      courtFigures(f, POSE, CAST.spread);
    });
    widePews(ctx);
    const settle = f.at('settle');
    const y = lerp(NAME.y + 22, NAME.y, settle);
    piece(ctx, rounded(NAME.x, y, NAME.w, NAME.h, 0), C.ink, f.hand('strip'), {
      role: 'scenery',
      kind: 'torn',
      torn: 5,
      shadow: 0.3,
      alpha: settle,
    });
    write(ctx, TITLE, NAME.x, y + 28, NAME.style, f.hand('title'), { alpha: settle, boil: 0 });
    ctx.restore();
  },
});
