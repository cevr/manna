// The villager toddler's skeletons, one a cut view (`core/puppet.ts`), read in
// view pixels and moved into its part sheet's frame (`frames.ts`) by the
// shared skeleton (`library/cutout/skeleton.ts`): their lean from their hip's
// middle to the base of their neck, their neck and head above it, and their
// left arm's shoulder, elbow and wrist on the joints their cut records
// (`joints.ts`), the wrist at the cuff and its tip at the round hand's middle.
// Their kept pose running (poses-1) shows only the near left arm, out behind
// them; the right arm is not drawn, so the skeleton has no bones for it. Their
// torso leans; their sandals and ground shadow stand with the root. The ground
// is the lead foot's sole (view y285); the back foot's heel is up, its sole
// 3 px above it (y282). The sleeve takes its shoulder's flap of torso. Pure
// data.

import type { Skeleton } from '@manna/film/core';
import { framed } from '../../../cutout/skeleton.ts';
import { type FramedView, keptAt } from './frames.ts';
import { JOINTS } from './joints.ts';

/** Each cut view's skeleton, in its part sheet's frame. */
export const SKELETONS = {
  'poses-1': framed(keptAt('poses-1'), {
    bones: [
      { name: 'lean', pivot: [115, 220], tip: [92, 150] },
      { name: 'neck', parent: 'lean', pivot: [92, 150], tip: [108, 122] },
      { name: 'head', parent: 'neck', pivot: [108, 122], tip: [75, 4] },
      {
        name: 'shoulderLeft',
        parent: 'lean',
        pivot: JOINTS['poses-1'].shoulderLeft,
        tip: JOINTS['poses-1'].elbowLeft,
      },
      {
        name: 'elbowLeft',
        parent: 'shoulderLeft',
        pivot: JOINTS['poses-1'].elbowLeft,
        tip: [205, 118],
      },
      { name: 'wristLeft', parent: 'elbowLeft', pivot: [205, 118], tip: [218, 108] },
    ],
    skin: {
      head: ['neck', 'head'],
      torso: ['lean'],
      armLeft: ['shoulderLeft', 'elbowLeft', 'wristLeft', 'lean'],
    },
    flaps: [
      {
        part: 'armLeft',
        from: 'torso',
        bone: 'shoulderLeft',
        body: 'lean',
        cap: 12,
        region: [
          [145, 86],
          [241, 86],
          [241, 158],
          [145, 158],
        ],
      },
    ],
    root: [115, 220],
  }),
} as const satisfies Readonly<Record<FramedView, Skeleton>>;
