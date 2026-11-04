import type { PaintingSpec } from '@manna/film/canvas';
import shadowPng from './shadow.png' with { type: 'file' };

/**
 * The parchment's contact shadow: one soft lavender-violet oval, drawn once
 * on the subscription route on a white ground and keyed to its alpha at
 * import (at most 0.6 opaque), its top-left at the origin.
 */
export const SHADOW = {
  key: 'in-its-order/storybook-shadow',
  png: shadowPng,
  size: [992, 233],
  open: ['top', 'right', 'bottom', 'left'],
} as const satisfies PaintingSpec;
