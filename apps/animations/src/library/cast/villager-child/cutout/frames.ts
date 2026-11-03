import { framesOf } from '../../../cutout/frames.ts';
import type { CutFrame } from '../../../cutout/table.ts';

export const FRAMES = {
  'poses-5': { sheet: 'poses', kept: [1019, 377, 1246, 766], pad: [3, 3, 3, 7] },
} as const satisfies Readonly<Record<string, CutFrame>>;

export type FramedView = keyof typeof FRAMES;

export const { boxOf, keptAt } = framesOf(FRAMES);
