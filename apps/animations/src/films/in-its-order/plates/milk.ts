import type { PaintingSpec } from '@manna/film/canvas';
import bookOpenPng from './milk-book-open.png' with { type: 'file' };
import bookShutPng from './milk-book-shut.png' with { type: 'file' };
import dropperPng from './milk-dropper.png' with { type: 'file' };
import pagePng from './milk-page.png' with { type: 'file' };
import ribbonPng from './milk-ribbon.png' with { type: 'file' };

const CLEAR = ['top', 'right', 'bottom', 'left'] as const;

/** The parchment page, peach-cream with gold rays from the top left, opaque over the whole plate. */
export const PAGE = {
  key: 'in-its-order/milk-page',
  png: pagePng,
  size: [1920, 1280],
  at: [0, -100],
} as const satisfies PaintingSpec;

/** The open book, its pages up; its centre at the origin. */
export const BOOK_OPEN = {
  key: 'in-its-order/milk-book-open',
  png: bookOpenPng,
  size: [431, 239],
  at: [-215.5, -119.5],
  open: CLEAR,
} as const satisfies PaintingSpec;

/** The shut book standing, its spine on the left; its centre at the origin. */
export const BOOK_SHUT = {
  key: 'in-its-order/milk-book-shut',
  png: bookShutPng,
  size: [262, 264],
  at: [-131, -132],
  open: CLEAR,
} as const satisfies PaintingSpec;

/** The white ribbon, twisting down from its top end; its own px, the top-left at the origin. */
export const RIBBON = {
  key: 'in-its-order/milk-ribbon',
  png: ribbonPng,
  size: [150, 315],
  at: [0, 0],
  open: CLEAR,
} as const satisfies PaintingSpec;

/** The ink dropper, leaning, a drop of ink under its tip; its tip at the origin. */
export const DROPPER = {
  key: 'in-its-order/milk-dropper',
  png: dropperPng,
  size: [53, 168],
  at: [-14, -130],
  open: CLEAR,
} as const satisfies PaintingSpec;
