import { framesOf } from '../../../../../library/cutout/frames.ts';
import type { CutFrame } from '../../../../../library/cutout/table.ts';

/**
 * His one cut view's frame: the lead's `iio-table` `bottle` cell laid on the
 * house paper as `kept/single-1.png` (the cell's 259 × 1024 px, its alpha
 * all or nothing), its kept box the figure's own (x 15 to 250, y 210 to 813)
 * and 3 px of paper round it.
 */
export const FRAMES = {
  'single-1': { sheet: 'single', kept: [15, 210, 251, 814], pad: [3, 3, 3, 3] },
} as const satisfies Readonly<Record<string, CutFrame>>;

/** His cut view, by its name. */
export type FramedView = keyof typeof FRAMES;

export const { boxOf, keptAt } = framesOf(FRAMES);
