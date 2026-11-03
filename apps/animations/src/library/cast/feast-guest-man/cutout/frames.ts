import { framesOf } from '../../../cutout/frames.ts';
import type { CutFrame } from '../../../cutout/table.ts';

export const FRAMES = {
  'poses-1': { sheet: 'poses', kept: [72, 108, 479, 844], pad: [3, 3, 3, 3] },
} as const satisfies Readonly<Record<string, CutFrame>>;

export type FramedView = keyof typeof FRAMES;

export const { boxOf, keptAt } = framesOf(FRAMES);
