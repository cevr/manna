// The feast mother's cut views, each its kept box on her sheet and the pad
// round it that makes the view's part sheet frame. Her ground line crosses each
// turnaround box's bottom edge, so a pad of 3 holds the line and no shadow.
// She is a film-scope member (In Its Order's `cast/feast-mother`), and the
// builder is the library's (`library/cutout/frames.ts`). Data.

import { framesOf } from '../../../../../library/cutout/frames.ts';
import type { CutFrame } from '../../../../../library/cutout/table.ts';

export const FRAMES = {
  front: { sheet: 'turnaround', kept: [43, 194, 262, 794], pad: [3, 3, 3, 3] },
  threeQuarterLeft: { sheet: 'turnaround', kept: [304, 192, 520, 794], pad: [3, 3, 3, 3] },
  back: { sheet: 'turnaround', kept: [781, 191, 998, 794], pad: [3, 3, 3, 3] },
} as const satisfies Readonly<Record<string, CutFrame>>;

/** A view of hers that is framed, by its name in her sheets' views. */
export type FramedView = keyof typeof FRAMES;

export const { boxOf, keptAt } = framesOf(FRAMES);
