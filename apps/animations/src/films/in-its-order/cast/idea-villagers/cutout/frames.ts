// The IDEA villagers' cut views, each its kept box on their poses sheet and the
// pad round it that makes the view's part sheet frame: the grown villager
// hopping (poses-3) and standing (poses-6), and the baby sitting (poses-4). They
// are a film-scope member (In Its Order's `cast/idea-villagers`), and the
// builder is the library's (`library/cutout/frames.ts`). Data.

import { framesOf } from '../../../../../library/cutout/frames.ts';
import type { CutFrame } from '../../../../../library/cutout/table.ts';

export const FRAMES = {
  'poses-3': { sheet: 'poses', kept: [544, 253, 888, 693], pad: [3, 3, 3, 3] },
  'poses-4': { sheet: 'poses', kept: [809, 560, 981, 762], pad: [3, 3, 3, 3] },
  'poses-6': { sheet: 'poses', kept: [1285, 248, 1492, 760], pad: [3, 3, 3, 3] },
} as const satisfies Readonly<Record<string, CutFrame>>;

/** A view of theirs that is framed, by its name in their sheet's views. */
export type FramedView = keyof typeof FRAMES;

export const { boxOf, keptAt } = framesOf(FRAMES);
