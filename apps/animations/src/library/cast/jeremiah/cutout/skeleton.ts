// Jeremiah's skeletons, one a cut view (`core/puppet.ts`), read in view
// pixels and moved into its part sheet's frame (`frames.ts`) by the shared
// skeleton (`library/cutout/skeleton.ts`). Each view is a bust: a lean from
// the foot of the view up to his head's pivot in his neck at the foot of his
// beard, and his head above it. His head, headcloth and its hanging sides turn
// on the head bone; his tunic and mantle lean. Pure data.

import type { Skeleton } from '@manna/film/core';
import { framed } from '../../../cutout/skeleton.ts';
import { type FramedView, keptAt } from './frames.ts';

/** A bust whose head turns at `pivot`, its lean rising from the view's foot (`foot`, the view's height) straight below it. */
const bust = (view: FramedView, pivot: readonly [number, number], foot: number) =>
  framed(keptAt(view), {
    bones: [
      { name: 'lean', pivot: [pivot[0], foot], tip: pivot },
      { name: 'head', parent: 'lean', pivot, tip: [pivot[0], 10] },
    ],
    skin: { head: ['head'], torso: ['lean'] },
    root: [pivot[0], foot],
  });

/** Each cut view's skeleton, in its part sheet's frame. */
export const SKELETONS = {
  'heads-1': bust('heads-1', [125, 215], 298),
  'heads-2': bust('heads-2', [122, 225], 294),
  'heads-3': bust('heads-3', [118, 215], 298),
  'heads-4': bust('heads-4', [120, 222], 298),
  'heads-5': bust('heads-5', [120, 220], 298),
  'heads-6': bust('heads-6', [116, 222], 299),
} as const satisfies Readonly<Record<FramedView, Skeleton>>;
