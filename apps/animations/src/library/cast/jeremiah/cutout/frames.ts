import { framesOf } from '../../../cutout/frames.ts';

type Box = readonly [number, number, number, number];

/**
 * Each cut view's frame: the kept sheet it is on, its kept box, and the
 * pixels its part sheet pads it by (left, top, right, bottom). Each view is a
 * bust whose foot is the crop's open edge, so it takes none below. His views
 * stand at least 4 px apart; heads-2's and heads-3's pads share two sheet
 * columns of paper, which `cut.ts` gives to one view each.
 */
export const FRAMES = {
  'heads-1': { sheet: 'heads', kept: [24, 317, 276, 615], pad: [3, 3, 3, 0] },
  'heads-2': { sheet: 'heads', kept: [287, 321, 533, 615], pad: [3, 3, 3, 0] },
  'heads-3': { sheet: 'heads', kept: [537, 317, 764, 615], pad: [3, 3, 3, 0] },
  'heads-4': { sheet: 'heads', kept: [776, 318, 1010, 616], pad: [3, 3, 3, 0] },
  'heads-5': { sheet: 'heads', kept: [1028, 317, 1262, 615], pad: [3, 3, 3, 0] },
  'heads-6': { sheet: 'heads', kept: [1281, 316, 1511, 615], pad: [3, 3, 3, 0] },
} as const satisfies Readonly<
  Record<string, { readonly sheet: 'heads'; readonly kept: Box; readonly pad: Box }>
>;

/** A cut view, by its name in his sheet's views. */
export type FramedView = keyof typeof FRAMES;

/** A view's part sheet frame on its kept sheet (its kept box padded, `boxOf`), and where the kept box's top-left corner lies in it (`keptAt`). */
export const { boxOf, keptAt } = framesOf(FRAMES);
