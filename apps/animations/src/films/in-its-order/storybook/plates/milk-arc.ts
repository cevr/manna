import type { PaintingSpec } from '@manna/film/canvas';
import milkArcPng from './milk-arc.png' with { type: 'file' };

/**
 * The milk poured from the book: one soft white arc with a lavender shade on
 * its lower edge, as panels `milk.newborn.5` and `milk.word.5` draw it, drawn
 * once on the subscription route on a flat green ground and keyed to its
 * alpha at import, its top-left at the origin.
 */
export const MILK_ARC = {
  key: 'in-its-order/storybook-milk-arc',
  png: milkArcPng,
  size: [1031, 644],
  open: ['top', 'right', 'bottom', 'left'],
} as const satisfies PaintingSpec;

/** Where the arc's two ends lie in its own px: the end the milk leaves the book from, at its right foot, and the end it falls into the cup at, its left foot. */
export const MILK_ARC_ENDS = {
  source: [1006, 615],
  mouth: [28, 515],
} as const;

/** The arc's brush in its own px, from the book's end over its top to the cup's end: each point on its middle line, wide enough to cover its band. */
export const MILK_ARC_BRUSH: ReadonlyArray<readonly [number, number, number]> = [
  [1006, 615, 40],
  [980, 540, 50],
  [955, 470, 55],
  [920, 381, 55],
  [880, 303, 55],
  [840, 239, 55],
  [800, 187, 55],
  [760, 145, 55],
  [720, 112, 55],
  [680, 86, 55],
  [640, 66, 55],
  [600, 53, 55],
  [560, 45, 55],
  [520, 42, 55],
  [480, 45, 55],
  [440, 52, 55],
  [400, 64, 55],
  [360, 80, 55],
  [320, 102, 55],
  [280, 129, 55],
  [240, 163, 55],
  [200, 203, 55],
  [160, 253, 55],
  [120, 313, 55],
  [80, 390, 55],
  [45, 465, 50],
  [28, 515, 40],
];
