import { framesOf } from '../../../cutout/frames.ts';

type Box = readonly [number, number, number, number];

export const FRAMES = {
  'heads-1': { sheet: 'heads', kept: [29, 336, 282, 641], pad: [3, 3, 3, 0] },
  'heads-2': { sheet: 'heads', kept: [279, 347, 530, 644], pad: [3, 3, 3, 0] },
  'heads-3': { sheet: 'heads', kept: [532, 338, 765, 645], pad: [3, 3, 3, 0] },
  'heads-4': { sheet: 'heads', kept: [772, 337, 1006, 646], pad: [3, 3, 3, 0] },
  'heads-5': { sheet: 'heads', kept: [1014, 337, 1255, 646], pad: [3, 3, 3, 0] },
  'heads-6': { sheet: 'heads', kept: [1263, 333, 1508, 646], pad: [3, 3, 3, 0] },
} as const satisfies Readonly<
  Record<string, { readonly sheet: 'heads'; readonly kept: Box; readonly pad: Box }>
>;

export type FramedView = keyof typeof FRAMES;

export const { boxOf, keptAt } = framesOf(FRAMES);
