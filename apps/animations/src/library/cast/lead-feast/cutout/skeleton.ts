// The series lead's skeletons, one a cut view (`core/puppet.ts`), read in
// view pixels and moved into its part sheet's frame (`frames.ts`) by the
// shared skeleton (`library/cutout/skeleton.ts`): his lean from his sash's
// knot to the base of his neck, his neck and head above it, and each arm's
// shoulder, elbow and wrist on the joints his cut records (`joints.ts`), the
// wrist at the cuff and its tip at his circle hand's middle. His bust
// (heads-4) is a lean and a head. Pure data.

import type { Skeleton } from '@manna/film/core';
import { framed, standing } from '../../../cutout/skeleton.ts';
import { type FramedView, keptAt } from './frames.ts';
import { JOINTS } from './joints.ts';

/** Each cut view's skeleton in its part sheet's frame, by the view's name in his sheets' views. */
export const SKELETONS = {
  front: framed(
    keptAt('front'),
    standing({
      hip: [123, 360],
      neck: [123, 205],
      chin: [122, 185],
      crown: [120, 20],
      ...JOINTS.front,
      wristRight: [31, 405],
      handRight: [29.5, 429],
      wristLeft: [215, 405],
      handLeft: [216.5, 428.5],
      flapRight: 51,
      flapLeft: 199,
      capRight: 13,
      capLeft: 13,
    }),
  ),
  threeQuarterLeft: framed(
    keptAt('threeQuarterLeft'),
    standing({
      hip: [110, 360],
      neck: [107, 215],
      chin: [106, 195],
      crown: [100, 20],
      ...JOINTS.threeQuarterLeft,
      wristRight: [22, 405],
      handRight: [20, 430],
      wristLeft: [183, 405],
      handLeft: [184, 430],
      flapRight: 45,
      flapLeft: 152,
      capRight: 11,
      capLeft: 13,
    }),
  ),
  'heads-4': framed(keptAt('heads-4'), {
    bones: [
      { name: 'lean', pivot: [120, 336], tip: [120, 232] },
      { name: 'head', parent: 'lean', pivot: [120, 232], tip: [120, 30] },
    ],
    skin: { head: ['head'], torso: ['lean'] },
    root: [120, 336],
  }),
} as const satisfies Readonly<Record<FramedView, Skeleton>>;
