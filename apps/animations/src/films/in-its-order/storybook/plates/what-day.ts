import type { PaintingSpec } from '@manna/film/canvas';
import whatDayPng from './cold-what-day.png' with { type: 'file' };

/**
 * `cold`'s last close by day (owner O1): the clay cup of milk and the round
 * loaf on the cream table top, lit by the courtyard's afternoon sun, the
 * feast's diners soft beyond, as panel `cold.what.3` draws it; drawn once on
 * the subscription route. The whole picture, laid at 1.25 so it spans the
 * frame and its push's margin.
 */
export const WHAT_DAY = {
  key: 'in-its-order/storybook-cold-what-day',
  png: whatDayPng,
  size: [1536, 1024],
  at: [0, -100],
} as const satisfies PaintingSpec;

/** The scale the day plate is laid at: 1920 × 1280 layer px, as the night plate it replaces. */
export const WHAT_DAY_SCALE = 1.25;
