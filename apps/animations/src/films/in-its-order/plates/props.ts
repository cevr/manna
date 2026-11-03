import type { PaintingSpec } from '@manna/film/canvas';
import openPng from './scroll-open.png' with { type: 'file' };
import rolledPng from './scroll-rolled.png' with { type: 'file' };
import rollerPng from './scroll-roller.png' with { type: 'file' };

export const SCROLL_ROLLED = {
  key: 'in-its-order/scroll-rolled',
  png: rolledPng,
  size: [429, 202],
  at: [-214.5, -202],
  open: ['top', 'right', 'bottom', 'left'],
} as const satisfies PaintingSpec;

export const SCROLL_OPEN = {
  key: 'in-its-order/scroll-open',
  png: openPng,
  size: [450, 368],
  at: [-225, 0],
  open: ['top', 'right', 'bottom', 'left'],
} as const satisfies PaintingSpec;

export const SCROLL_ROLLER = {
  key: 'in-its-order/scroll-roller',
  png: rollerPng,
  size: [450, 88],
  at: [-225, 280],
  open: ['top', 'right', 'bottom', 'left'],
} as const satisfies PaintingSpec;
