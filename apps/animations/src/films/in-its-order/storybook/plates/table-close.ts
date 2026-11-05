import type { PaintingSpec } from '@manna/film/canvas';
import tableClosePng from './table-close.png' with { type: 'file' };

/**
 * The long table's middle painted again for cold-ouch's close (owner,
 * critique 2 finding 7: the whole table plate shown at the close's zoom was
 * soft beside the crisp figures and scroll): `table.png`'s plate px
 * `TABLE_CLOSE_BOX` drawn once on the subscription route at 2.4 times its
 * size, from that crop on a flat green ground, keyed to its alpha, its
 * colours matched to the crop's, laid exactly over it.
 */
export const TABLE_CLOSE = {
  key: 'in-its-order/storybook-table-close',
  png: tableClosePng,
  size: [1536, 1024],
} as const satisfies PaintingSpec;

/** The box of `table.png` (its own px) the close plate paints again. */
export const TABLE_CLOSE_BOX = { x: 640, y: 780, width: 640, height: 427 } as const;
