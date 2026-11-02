// The filler bases' skeletons, one a cut view (`core/puppet.ts`), read in view
// pixels and moved into its part sheet's frame (`frames.ts`) by the shared
// skeleton (`library/cutout/skeleton.ts`). Each view is a bust
// (`library/cutout/bust.ts`): a lean from the view's foot, the waist row, up
// to the head's pivot at the neck's centre on the cut line (`cut.ts`), and the
// head above it. The head turns on the head bone; the robe, neck and collar
// lean. Pure data: each view's pivot and foot.

import type { Skeleton } from '@manna/film/core';
import { bustSkeleton } from '../../../cutout/bust.ts';
import { framed } from '../../../cutout/skeleton.ts';
import { FRAMES, type FramedView, keptAt } from './frames.ts';

/** A view's foot: its kept box's height, crown to waist, where the lean rises from. */
const footOf = (view: FramedView) => FRAMES[view].kept[3] - FRAMES[view].kept[1];

/** Each cut view's skeleton, in its part sheet's frame. */
export const SKELETONS = {
  'poses-1': framed(keptAt('poses-1'), bustSkeleton([151, 223], footOf('poses-1'))),
  'poses-2': framed(keptAt('poses-2'), bustSkeleton([140, 219], footOf('poses-2'))),
  'poses-3': framed(keptAt('poses-3'), bustSkeleton([150, 220], footOf('poses-3'))),
  'poses-4': framed(keptAt('poses-4'), bustSkeleton([141, 220], footOf('poses-4'))),
} as const satisfies Readonly<Record<FramedView, Skeleton>>;
