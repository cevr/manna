import {
  type Camera,
  drawing,
  knobCamera,
  probePlate,
  rectShape,
  shotPath,
  write,
  glow,
} from '@manna/film/canvas';
import { clamp } from '@manna/film/core';
import { landingSky, rooftop } from '../../city.ts';
import { C, F, piece } from '../../kit.ts';
import { CREDITS } from '../credits.ts';
import { thesis } from './thesis.ts';

const STYLES = {
  name: { family: F.display, size: 52, weight: 700, color: C.ink, align: 'center' },
  head: { family: F.display, size: 30, weight: 700, color: C.ink, align: 'center' },
  item: { family: F.body, size: 26, color: C.inkSoft, align: 'center' },
} as const;
const LEADING = { name: 72, head: 46, item: 38 } as const;

const BASELINES = CREDITS.reduce<number[]>((ys, c, i) => {
  ys.push((i === 0 ? 0 : (ys[i - 1] ?? 0)) + c.gap + LEADING[c.kind]);
  return ys;
}, []);
const KEYS = CREDITS.map((_, i) => `credit${i}`);

const STRIP = { x: 90, y: 70, w: 700, h: 940 } as const;
const STRIP_SHAPE = rectShape(STRIP.x, STRIP.y, STRIP.w, STRIP.h);
const FADE = 90;
const MARGIN = 24;

const LAST = CREDITS.length - 1;
const TOP_FROM = STRIP.y + STRIP.h - MARGIN - FADE - (BASELINES[0] ?? 0);
const TOP_TO =
  STRIP.y + MARGIN + FADE + STYLES[CREDITS[LAST]?.kind ?? 'item'].size - (BASELINES[LAST] ?? 0);
const PACE = 128;
const ROLL = (TOP_FROM - TOP_TO) / PACE;
const SETTLE = 2;

export const end = drawing({
  drift: 0,
  timeline: {
    stripIn: { at: 'start', dur: 0.8 },
    roll: { at: 'start', dur: ROLL, ease: 'linear' },
    stripOut: { after: 'roll', dur: 0.8 },
    back: { with: 'roll', dur: ROLL + SETTLE, ease: 'inOutSine' },
  },
  knobs: {
    wide: [1060, 560],
    wideZoom: 1,
  },
  draw: (f) => {
    const { ctx, w, h } = f;
    landingSky(ctx, w, h);
    glow(ctx, 960, 380, 750, C.glow, 0.55);
    const city = f.knobsOf(thesis);
    const cam: Camera = shotPath(knobCamera(city('city'), city('cityZoom')), [
      [f.at('back'), knobCamera(f.knob('wide'), f.knob('wideZoom'))],
    ]);
    rooftop(ctx, w, h, f.handsOf(thesis), cam, 1);

    const shown = f.at('stripIn') * (1 - f.at('stripOut'));
    if (shown <= 0) return;
    ctx.save();
    ctx.globalAlpha *= shown;
    piece(ctx, STRIP_SHAPE, C.cream, f.hand('strip'), {
      role: 'scenery',
      kind: 'cut',
      line: 0,
      torn: 3,
      shadow: 0.5,
    });
    const top = TOP_FROM + f.at('roll') * (TOP_TO - TOP_FROM);
    const cx = STRIP.x + STRIP.w / 2;
    probePlate(ctx, STRIP_SHAPE, () =>
      CREDITS.forEach((c, i) => {
        const y = top + (BASELINES[i] ?? 0);
        const above = y - STYLES[c.kind].size - STRIP.y - MARGIN;
        const below = STRIP.y + STRIP.h - MARGIN - y;
        if (above < 0 || below < 0) return;
        write(ctx, c.text, cx, y, STYLES[c.kind], f.hand(KEYS[i] ?? i), {
          alpha: clamp(Math.min(above, below) / FADE),
          boil: 0,
        });
      }),
    );
    ctx.restore();
  },
});
