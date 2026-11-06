import { framesOf } from '../../../../../library/cutout/frames.ts';
import type { CutFrame } from '../../../../../library/cutout/table.ts';

/**
 * His one cut view's frame: the guest man's `iio-table` `neutral` cell laid
 * on the house paper as `kept/single-1.png` (the cell's 369 × 1024 px, its
 * alpha all or nothing), its kept box the figure's own (x 2 to 353, y 161 to
 * 829), 2 px of paper on its left (the cell's edge) and 3 px elsewhere.
 */
export const FRAMES = {
  'single-1': { sheet: 'single', kept: [2, 161, 354, 830], pad: [2, 3, 3, 3] },
} as const satisfies Readonly<Record<string, CutFrame>>;

/** His cut view, by its name. */
export type FramedView = keyof typeof FRAMES;

export const { boxOf, keptAt } = framesOf(FRAMES);
