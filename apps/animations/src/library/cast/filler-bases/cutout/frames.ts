import { framesOf } from '../../../cutout/frames.ts';
import type { CutFrame } from '../../../cutout/table.ts';

export const FRAMES = {
  'poses-1': { sheet: 'poses', kept: [76, 141, 378, 560], pad: [3, 3, 3, 0] },
  'poses-2': { sheet: 'poses', kept: [450, 159, 728, 560], pad: [3, 3, 3, 0] },
  'poses-3': { sheet: 'poses', kept: [791, 146, 1090, 560], pad: [3, 3, 3, 0] },
  'poses-4': { sheet: 'poses', kept: [1164, 159, 1447, 560], pad: [3, 3, 3, 0] },
} as const satisfies Readonly<Record<string, CutFrame>>;

export type FramedView = keyof typeof FRAMES;

export const { boxOf, keptAt } = framesOf(FRAMES);
