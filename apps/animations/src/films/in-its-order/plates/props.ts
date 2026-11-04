import type { PaintingSpec } from '@manna/film/canvas';
import openPng from './scroll-open.png' with { type: 'file' };
import rolledPng from './scroll-rolled.png' with { type: 'file' };

/** The rolled scroll, its two rollers bound by a band and the gold seal; its foot's centre at the origin. */
export const SCROLL_ROLLED = {
  key: 'in-its-order/scroll-rolled',
  png: rolledPng,
  size: [429, 202],
  at: [-214.5, -202],
  open: ['top', 'right', 'bottom', 'left'],
} as const satisfies PaintingSpec;

/** The open scroll between its two rollers, the gold seal low on the right; its top's centre at the origin. */
export const SCROLL_OPEN = {
  key: 'in-its-order/scroll-open',
  png: openPng,
  size: [450, 368],
  at: [-225, 0],
  open: ['top', 'right', 'bottom', 'left'],
} as const satisfies PaintingSpec;
