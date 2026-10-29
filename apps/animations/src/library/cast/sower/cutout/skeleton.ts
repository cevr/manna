// The sower's skeletons, one a cut view (`core/puppet.ts`), read in view
// pixels and moved into its part sheet's frame (`frames.ts`) by the shared
// skeleton (`library/cutout/skeleton.ts`): his lean from his belt's middle to
// the base of his neck, his neck and head above it, and each arm's shoulder,
// elbow and wrist on the joints his cut records (`joints.ts`), the wrist at
// the cuff and its tip at his circle hand's middle. Pure data.

import type { Skeleton } from '@manna/film/core';
import { framed, standing } from '../../../cutout/skeleton.ts';
import { type FramedView, keptAt } from './frames.ts';
import { JOINTS } from './joints.ts';

/** Each cut view's skeleton in its part sheet's frame, by the view's name in his sheets' views. */
export const SKELETONS = {
  front: framed(
    keptAt('front'),
    standing({
      hip: [126, 321],
      neck: [126, 200],
      chin: [126, 185],
      crown: [126, 10],
      ...JOINTS.front,
      wristRight: [30, 344],
      handRight: [32, 366],
      wristLeft: [226, 344],
      handLeft: [228.5, 369],
      flapRight: 56,
      flapLeft: 199,
      capRight: 14,
      capLeft: 14,
    }),
  ),
} as const satisfies Readonly<Record<FramedView, Skeleton>>;
