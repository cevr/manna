import type { CardStyle, VerseStyle } from '@manna/film/canvas';
import { fonts, palette } from './palette.ts';

export const CARD_GROUND = palette.night;

export const VERSE_STYLE: VerseStyle = {
  type: { family: fonts.display, size: 64, weight: 500, color: palette.ink, leading: 1.45 },
  width: 1180,
  highlight: CARD_GROUND,
  lit: palette.cream,
};

export const CARD_STYLE: CardStyle = {
  ground: CARD_GROUND,
  type: { family: fonts.display, size: 96, weight: 500, color: palette.cream, leading: 1.2 },
  payoffScale: 2.6,
  payoffColor: palette.gold,
  payoffType: { weight: 700 },
  case: 'said',
  treatment: {
    draw: (ctx, box) => {
      ctx.fillStyle = palette.gold;
      ctx.fillRect(box.x, box.y + box.h * 0.9, box.w, box.h * 0.035);
    },
  },
};
