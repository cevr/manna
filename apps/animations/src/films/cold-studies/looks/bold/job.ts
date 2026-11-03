import { type Box, type CardWord, type TextStyle, measure, verse, write } from '@manna/film/canvas';
import { lerp } from '@manna/film/core';
import { VERSE } from '../../look.ts';
import type { JobFrame } from '../../scenes/job.ts';
import { FACE, INK, rect } from './flat.ts';

const COLUMN = 600;
const TEXT_X = 720;

const VERSE_TYPE: TextStyle = {
  family: FACE,
  size: 84,
  weight: 600,
  color: INK.ink,
  leading: 1.32,
  tracking: -0.01,
};

export const job = (f: JobFrame): Box => {
  const { ctx, w, h, t } = f;
  const wipe = f.keys('page', [
    [0, 0],
    [0.7, 1, 'outExpo'],
  ]);
  const slide = f.keys('page', [
    [0.25, 0],
    [1, 1, 'outExpo'],
  ]);
  const zoom = 1 + 0.012 * t;
  rect(ctx, 0, 0, w, h, INK.bone);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-w / 2, -h / 2);
  rect(ctx, 0, 0, COLUMN * wipe, h, INK.slate);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, COLUMN * wipe, h);
  ctx.clip();
  write(
    ctx,
    'JOB',
    70,
    330,
    { family: FACE, size: 230, weight: 700, color: INK.bone, tracking: -0.04 },
    f.hand('book'),
    { boil: 0 },
  );
  write(
    ctx,
    '9:2',
    62,
    760,
    { family: FACE, size: 330, weight: 700, color: INK.deep, tracking: -0.05 },
    f.hand('verse-no'),
    { boil: 0 },
  );
  ctx.restore();
  rect(ctx, TEXT_X, 370 + 40 * (1 - slide), 140, 20, INK.ink);
  const box = verse(
    ctx,
    VERSE,
    { type: VERSE_TYPE, width: 1060, highlight: INK.ink, lit: INK.bone },
    { x: TEXT_X + lerp(220, 0, slide), y: 530, highlight: f.at('sweep') },
    f.hand('verse'),
  );
  ctx.restore();
  return box;
};

const lowered = (text: string) => (/god/i.test(text) ? text : text.toLowerCase());

const LEAD: TextStyle = { family: FACE, size: 128, weight: 700, color: INK.bone, tracking: -0.035 };
const PAYOFF: TextStyle = { ...LEAD, size: 128 * 3.2, color: INK.gold, tracking: -0.05 };

const MARGIN = 170;
const OFFSET = 16;

export const card = (f: JobFrame, words: ReadonlyArray<CardWord>) => {
  const { ctx, w, h, t } = f;
  rect(ctx, 0, 0, w, h, INK.ink);
  const payoff = words.findIndex((word) => word.payoff);
  const lines = [words.slice(0, payoff), words.slice(payoff, payoff + 1), words.slice(payoff + 1)];
  const style = (i: number) => (i === 1 ? PAYOFF : LEAD);
  const tall = (i: number) => (i === 1 ? PAYOFF.size * 1.0 : LEAD.size * 1.12);
  const total = lines.reduce((sum, _, i) => sum + tall(i), 0);
  const card = f.cue('card');
  const zoom = 1 + 0.01 * Math.max(0, t - card.start);
  ctx.save();
  ctx.translate(MARGIN, h / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-MARGIN, -h / 2);
  let top = (h - total) / 2;
  for (const [i, line] of lines.entries()) {
    const s = style(i);
    const y = top + tall(i) * (i === 1 ? 0.78 : 0.8);
    let x = MARGIN;
    for (const [k, word] of line.entries()) {
      const text = lowered(word.text);
      const ww = measure(ctx, text, s);
      if (t >= word.at) {
        if (word.payoff)
          write(
            ctx,
            text,
            x + OFFSET,
            y + OFFSET,
            { ...s, color: INK.slate },
            f.hand(`shade${k}`),
            {
              boil: 0,
            },
          );
        write(ctx, text, x, y, s, f.hand(`card${i}.${k}`), { boil: 0 });
      }
      x += ww + measure(ctx, ' ', s);
    }
    top += tall(i);
  }
  ctx.restore();
};
