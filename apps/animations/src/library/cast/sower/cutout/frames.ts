import { framesOf } from '../../../cutout/frames.ts';
import type { CutFrame } from '../../../cutout/table.ts';

export const FRAMES = {
  front: { sheet: 'turnaround', kept: [28, 227, 283, 776], pad: [3, 3, 3, 12] },
  threeQuarterLeft: { sheet: 'turnaround', kept: [308, 227, 538, 776], pad: [3, 3, 3, 18] },
  back: { sheet: 'turnaround', kept: [775, 226, 1028, 776], pad: [3, 3, 3, 21] },
  profileLeft: { sheet: 'turnaround', kept: [568, 227, 743, 776], pad: [3, 3, 3, 21] },
  profileRight: { sheet: 'turnaround', kept: [1057, 226, 1221, 776], pad: [3, 3, 3, 21] },
  threeQuarterRight: { sheet: 'turnaround', kept: [1264, 227, 1492, 776], pad: [3, 3, 3, 23] },
  'poses-1': { sheet: 'poses', kept: [52, 249, 450, 834], pad: [3, 3, 3, 15] },
  'poses-2': { sheet: 'poses', kept: [488, 249, 784, 838], pad: [3, 3, 3, 15] },
  'poses-3': { sheet: 'poses', kept: [853, 250, 1125, 835], pad: [3, 3, 3, 15] },
  'poses-4': { sheet: 'poses', kept: [1178, 249, 1488, 835], pad: [3, 3, 3, 15] },
} as const satisfies Readonly<Record<string, CutFrame>>;

export type FramedView = keyof typeof FRAMES;

export const { boxOf, keptAt } = framesOf(FRAMES);
