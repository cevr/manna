import type { CardStyle, VerseStyle } from '@manna/film/canvas';
import { C, F } from './kit.ts';

export const CARD_GROUND = C.night;

export const VERSE_STYLE: VerseStyle = {
  type: { family: F.display, size: 64, weight: 500, color: C.ink, leading: 1.45 },
  width: 1180,
  highlight: CARD_GROUND,
  lit: C.cream,
};

export const CARD_STYLE: CardStyle = {
  ground: CARD_GROUND,
  type: { family: F.display, size: 96, weight: 500, color: C.cream, leading: 1.2 },
  payoffScale: 2.6,
  payoffColor: C.gold,
  payoffType: { weight: 700 },
  case: 'said',
  treatment: {
    draw: (ctx, box) => {
      ctx.fillStyle = C.gold;
      ctx.fillRect(box.x, box.y + box.h * 0.9, box.w, box.h * 0.035);
    },
  },
};
