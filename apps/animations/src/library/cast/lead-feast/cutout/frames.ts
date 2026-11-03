import { framesOf } from '../../../cutout/frames.ts';

type Box = readonly [number, number, number, number];

export const FRAMES = {
  front: { sheet: 'turnaround', kept: [18, 194, 265, 857], pad: [3, 3, 3, 12] },
  threeQuarterLeft: { sheet: 'turnaround', kept: [292, 194, 511, 857], pad: [3, 3, 3, 12] },
  'heads-4': { sheet: 'heads', kept: [774, 314, 1014, 650], pad: [3, 3, 3, 0] },
  'single-1': { sheet: 'single', kept: [191, 109, 742, 1382], pad: [3, 3, 3, 12] },
  'single-9': { sheet: 'single', kept: [191, 200, 766, 1300], pad: [3, 3, 3, 12] },
  'single-5': { sheet: 'single', kept: [772, 293, 1076, 710], pad: [3, 3, 3, 0] },
} as const satisfies Readonly<
  Record<
    string,
    { readonly sheet: 'turnaround' | 'heads' | 'single'; readonly kept: Box; readonly pad: Box }
  >
>;

export type FramedView = keyof typeof FRAMES;

export const { boxOf, keptAt } = framesOf(FRAMES);
