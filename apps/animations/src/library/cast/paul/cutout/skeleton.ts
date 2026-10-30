// Paul's skeletons, one a cut view (`core/puppet.ts`), read in view pixels
// and moved into its part sheet's frame (`frames.ts`) by the shared skeleton
// (`library/cutout/skeleton.ts`). Each view is a bust (`library/cutout/bust.ts`):
// a lean from the foot of the view up to his head's pivot at the foot of his
// beard, and his head above it. His head turns on the head bone; his mantle
// and tunic lean. Pure data: each view's pivot and foot.

import type { Skeleton } from '@manna/film/core';
import { bustSkeleton } from '../../../cutout/bust.ts';
import { framed } from '../../../cutout/skeleton.ts';
import { type FramedView, keptAt } from './frames.ts';

/** Each cut view's skeleton, in its part sheet's frame. */
export const SKELETONS = {
  'heads-1': framed(keptAt('heads-1'), bustSkeleton([118, 240], 305)),
  'heads-2': framed(keptAt('heads-2'), bustSkeleton([124, 244], 297)),
  'heads-3': framed(keptAt('heads-3'), bustSkeleton([112, 244], 307)),
  'heads-4': framed(keptAt('heads-4'), bustSkeleton([117, 240], 309)),
  'heads-5': framed(keptAt('heads-5'), bustSkeleton([121, 242], 309)),
  'heads-6': framed(keptAt('heads-6'), bustSkeleton([123, 240], 313)),
} as const satisfies Readonly<Record<FramedView, Skeleton>>;
