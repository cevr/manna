import { framesOf } from '../../../cutout/frames.ts';

type Box = readonly [number, number, number, number];

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

export type FramedView = keyof typeof FRAMES;

export const { boxOf, keptAt } = framesOf(FRAMES);
