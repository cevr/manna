import { framesOf } from '../../../cutout/frames.ts';
import type { CutFrame } from '../../../cutout/table.ts';

export const FRAMES = {
  'poses-1': { sheet: 'poses', kept: [35, 461, 277, 747], pad: [3, 3, 3, 23] },
  'poses-2': { sheet: 'poses', kept: [323, 523, 489, 768], pad: [8, 3, 11, 5] },
} as const satisfies Readonly<Record<string, CutFrame>>;

export type FramedView = keyof typeof FRAMES;

export const { boxOf, keptAt } = framesOf(FRAMES);
