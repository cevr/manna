import type { Skeleton } from '@manna/film/core';
import { bustSkeleton } from '../../../cutout/bust.ts';
import { framed } from '../../../cutout/skeleton.ts';
import { type FramedView, keptAt } from './frames.ts';

export const SKELETONS = {
  'heads-1': framed(keptAt('heads-1'), bustSkeleton([125, 215], 298)),
  'heads-2': framed(keptAt('heads-2'), bustSkeleton([122, 225], 294)),
  'heads-3': framed(keptAt('heads-3'), bustSkeleton([118, 215], 298)),
  'heads-4': framed(keptAt('heads-4'), bustSkeleton([120, 222], 298)),
  'heads-5': framed(keptAt('heads-5'), bustSkeleton([120, 220], 298)),
  'heads-6': framed(keptAt('heads-6'), bustSkeleton([116, 222], 299)),
} as const satisfies Readonly<Record<FramedView, Skeleton>>;
