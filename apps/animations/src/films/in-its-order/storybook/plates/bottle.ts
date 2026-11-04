import type { PaintingSpec } from '@manna/film/canvas';
import bottlePng from './bottle.png' with { type: 'file' };

/**
 * The lead's baby's bottle set down on the table (critique 1, items 6 and
 * 7): his table sheet's bottle drawn alone once on the subscription route,
 * from that sheet's own bottle as its reference, on a flat green ground and
 * keyed to its alpha at import, its top-left at the origin.
 */
export const BOTTLE = {
  key: 'in-its-order/storybook-bottle',
  png: bottlePng,
  size: [294, 668],
  open: ['top', 'right', 'bottom', 'left'],
} as const satisfies PaintingSpec;

/** The bottle's foot in its own px: the middle of its base, where it stands on the table. */
export const BOTTLE_FOOT = [147, 668] as const;

/** The bottle's cream body across, in its own px: what sizes it to the bottle the lead holds. */
export const BOTTLE_BODY = 237;
