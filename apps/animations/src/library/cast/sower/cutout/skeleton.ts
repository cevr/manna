// The sower's skeletons, one a cut view (`core/puppet.ts`), read in view
// pixels and moved into its part sheet's frame (`frames.ts`) by the shared
// skeleton (`library/cutout/skeleton.ts`): his lean from his belt's middle to
// the base of his neck, his neck and head above it, and each arm's shoulder,
// elbow and wrist on the joints his cut records (`joints.ts`), the wrist at
// the cuff and its tip at his circle hand's middle. His torso (with the seed
// bag that hangs from it) leans; his robe, sandals and ground shadow stand
// with the root; each sleeve takes its shoulder's flap of torso. Pure data.

import type { Skeleton } from '@manna/film/core';
import { type Body, framed, standing } from '../../../cutout/skeleton.ts';
import { type FramedView, keptAt } from './frames.ts';
import { JOINTS } from './joints.ts';

/** His parts as his part sheets name them (`cut.ts`), each on its bones; his sleeves' flaps from his torso, in a band 50 px above each shoulder to 12 below, reaching 60 past it. */
const BODY: Body = {
  skin: {
    head: ['neck', 'head'],
    torso: ['lean'],
    armRight: ['shoulderRight', 'elbowRight', 'wristRight', 'lean'],
    armLeft: ['shoulderLeft', 'elbowLeft', 'wristLeft', 'lean'],
  },
  arms: { right: 'armRight', left: 'armLeft' },
  from: 'torso',
  band: { above: 50, below: 12, reach: 60 },
};

/** Each cut view's skeleton in its part sheet's frame, by the view's name in his sheets' views. */
export const SKELETONS = {
  front: framed(
    keptAt('front'),
    standing(BODY, {
      facing: 'front',
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
