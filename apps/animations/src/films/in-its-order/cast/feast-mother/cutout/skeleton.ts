// The feast mother's skeletons, one per cut view, read in the kept view's
// pixels and moved into its part sheet's frame (`framed`). Each turnaround view
// stands: lean from the hip, neck, head, and each arm's shoulder, elbow and
// wrist, built by the library's `standing`. Her veil and robe ride the lean (the
// torso and the root); each sleeve's flap of the torso bends round its
// shoulder. Data.

import type { Skeleton } from '@manna/film/core';
import { type Body, framed, standing } from '../../../../../library/cutout/skeleton.ts';
import { type FramedView, keptAt } from './frames.ts';
import { JOINTS } from './joints.ts';

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

/** Each cut view's skeleton in its part sheet's frame, by the view's name in her sheets' views. */
export const SKELETONS = {
  front: framed(
    keptAt('front'),
    standing(BODY, {
      facing: 'front',
      hip: [109, 330],
      neck: [109, 190],
      chin: [109, 167],
      crown: [113, 0],
      ...JOINTS.front,
      wristRight: [28, 348],
      handRight: [28, 371],
      wristLeft: [188, 348],
      handLeft: [188, 371],
      flapRight: 57,
      flapLeft: 161,
      capRight: 8,
      capLeft: 8,
    }),
  ),
  // turned to the viewer's left: her right arm still on the viewer's left
  threeQuarterLeft: framed(
    keptAt('threeQuarterLeft'),
    standing(BODY, {
      facing: 'front',
      hip: [95, 330],
      neck: [98, 195],
      chin: [100, 175],
      crown: [102, 0],
      ...JOINTS.threeQuarterLeft,
      wristRight: [18, 348],
      handRight: [18, 371],
      wristLeft: [152, 348],
      handLeft: [152, 371],
      flapRight: 42,
      flapLeft: 121,
      capRight: 8,
      capLeft: 8,
    }),
  ),
  // from behind: her right arm on the viewer's right, so its flap runs out from its edge
  back: framed(
    keptAt('back'),
    standing(BODY, {
      facing: 'back',
      hip: [107, 330],
      neck: [107, 200],
      chin: [107, 170],
      crown: [107, 0],
      ...JOINTS.back,
      wristRight: [192, 350],
      handRight: [192, 375],
      wristLeft: [26, 350],
      handLeft: [27, 375],
      flapRight: 168,
      flapLeft: 50,
      capRight: 8,
      capLeft: 8,
    }),
  ),
} as const satisfies Readonly<Record<FramedView, Skeleton>>;
