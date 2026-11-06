import type { PaintingSpec } from '@manna/film/canvas';
import bookClosePng from './milk-book-close.png' with { type: 'file' };
import cupClosePng from './milk-cup-close.png' with { type: 'file' };
import dropperClosePng from './milk-dropper-close.png' with { type: 'file' };
import pourClosePng from './milk-pour-close.png' with { type: 'file' };
import scrollPng from './cold-scroll.png' with { type: 'file' };

const CLEAR = ['top', 'right', 'bottom', 'left'] as const;

/**
 * Act 1's inserts (critique 1, findings 1 and 3), each drawn once on the
 * subscription route in the house look, opaque over the whole plate, laid
 * as `WHAT_DAY` is (`INSERT_SCALE`, its top 100 px above the frame's): the
 * open scroll the lead holds up at the feast, its parchment blank for
 * Heb 5:12 to be lettered on; the open book on the feast table, its pages
 * blank for 1 Pet 2:2; and the feast table close, the open book tipped
 * over its middle, where the cup stands and the milk is poured.
 */
export const SCROLL_CLOSE = {
  key: 'in-its-order/storybook-cold-scroll',
  png: scrollPng,
  size: [1536, 1024],
  at: [0, -100],
} as const satisfies PaintingSpec;

/** The open book on the feast table, close. */
export const BOOK_CLOSE = {
  key: 'in-its-order/storybook-milk-book-close',
  png: bookClosePng,
  size: [1536, 1024],
  at: [0, -100],
} as const satisfies PaintingSpec;

/** The feast table close, the open book tipped over it. */
export const POUR_CLOSE = {
  key: 'in-its-order/storybook-milk-pour-close',
  png: pourClosePng,
  size: [1536, 1024],
  at: [0, -100],
} as const satisfies PaintingSpec;

/** The scale every opaque insert is laid at: its 1536 px across the frame's 1920. */
export const INSERT_SCALE = 1.25;

/** Where each insert's blank face lies in its own px, the box its words are lettered in: the scroll's parchment, and each of the book's two pages. */
export const INSERT_FACES = {
  parchment: { x0: 470, y0: 250, x1: 1070, y1: 780 },
  left: { x0: 230, y0: 280, x1: 720, y1: 790 },
  right: { x0: 820, y0: 280, x1: 1320, y1: 790 },
} as const;

/** The pour close's book: the lower corner of its left page, in the plate's px, where the milk leaves it. */
export const POUR_LIP = [784, 590] as const;

/**
 * The clay cup on the feast table, close (and the milk dropper below), drawn
 * once on the subscription route on a flat green ground and keyed to its
 * alpha, its top-left at the origin.
 */
export const CUP_CLOSE = {
  key: 'in-its-order/storybook-milk-cup-close',
  png: cupClosePng,
  size: [412, 409],
  open: CLEAR,
} as const satisfies PaintingSpec;

/** The cup's foot (the middle of its base) and the inside of its mouth (centre and radii), in its own px. */
export const CUP_CLOSE_AT = {
  foot: [205, 400],
  mouth: { x: 205, y: 72, rx: 168, ry: 39 },
} as const;

/** The milk dropper, large, its drop of ink hanging from its tip. */
export const DROPPER_CLOSE = {
  key: 'in-its-order/storybook-milk-dropper-close',
  png: dropperClosePng,
  size: [333, 669],
  open: CLEAR,
} as const satisfies PaintingSpec;

/** The dropper's tip in its own px: the middle of its hanging drop. */
export const DROPPER_TIP = [32, 640] as const;
