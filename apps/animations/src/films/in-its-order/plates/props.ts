import type { PaintingSpec } from '@manna/film/canvas';
import rolledPng from './scroll-rolled.png' with { type: 'file' };

/** The rolled scroll, its two rollers bound by a band and the gold seal; its foot's centre at the origin. */
export const SCROLL_ROLLED = {
  key: 'in-its-order/scroll-rolled',
  png: rolledPng,
  size: [429, 202],
  at: [-214.5, -202],
  open: ['top', 'right', 'bottom', 'left'],
} as const satisfies PaintingSpec;
