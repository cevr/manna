import { framesOf } from '../../../../../library/cutout/frames.ts';
import type { CutFrame } from '../../../../../library/cutout/table.ts';

export const FRAMES = {
  'poses-3': { sheet: 'poses', kept: [544, 253, 888, 693], pad: [3, 3, 3, 3] },
  'poses-4': { sheet: 'poses', kept: [809, 560, 981, 762], pad: [3, 3, 3, 3] },
  'poses-6': { sheet: 'poses', kept: [1285, 248, 1492, 760], pad: [3, 3, 3, 3] },
  'single-15': { sheet: 'single', kept: [291, 274, 742, 1403], pad: [3, 3, 3, 17] },
} as const satisfies Readonly<Record<string, CutFrame>>;

export type FramedView = keyof typeof FRAMES;

export const { boxOf, keptAt } = framesOf(FRAMES);
