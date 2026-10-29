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

/** Her body in a profile to the viewer's left, which draws her left arm only. */
const PROFILE_LEFT: Body<{ readonly left: string }> = {
  skin: {
    head: ['neck', 'head'],
    torso: ['lean'],
    armLeft: ['shoulderLeft', 'elbowLeft', 'wristLeft', 'lean'],
  },
  arms: { left: 'armLeft' },
  from: 'torso',
  band: { above: 50, below: 12, reach: 25 },
};

/** Her body in a profile to the viewer's right, which draws her right arm only: its flap runs from the sheet's left edge, over her back, to the sleeve's front edge. */
const PROFILE_RIGHT: Body<{ readonly right: string }> = {
  skin: {
    head: ['neck', 'head'],
    torso: ['lean'],
    armRight: ['shoulderRight', 'elbowRight', 'wristRight', 'lean'],
  },
  arms: { right: 'armRight' },
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
  // facing the viewer's left: her left arm only, its flap from the sleeve's front edge
  profileLeft: framed(
    keptAt('profileLeft'),
    standing(PROFILE_LEFT, {
      facing: 'front',
      hip: [80, 330],
      neck: [88, 185],
      chin: [52, 162],
      crown: [92, 0],
      ...JOINTS.profileLeft,
      wristLeft: [87, 350],
      handLeft: [87, 375],
      flapLeft: 66,
      capLeft: 10,
    }),
  ),
  // facing the viewer's right: her right arm only, its flap from the sleeve's front edge
  profileRight: framed(
    keptAt('profileRight'),
    standing(PROFILE_RIGHT, {
      facing: 'front',
      hip: [121, 330],
      neck: [113, 185],
      chin: [150, 162],
      crown: [109, 0],
      ...JOINTS.profileRight,
      wristRight: [114.5, 350],
      handRight: [114.5, 374],
      flapRight: 136,
      capRight: 10,
    }),
  ),
  // turned to the viewer's right: her near right arm on the viewer's left
  threeQuarterRight: framed(
    keptAt('threeQuarterRight'),
    standing(BODY, {
      facing: 'front',
      hip: [124, 330],
      neck: [120, 195],
      chin: [125, 176],
      crown: [117, 0],
      ...JOINTS.threeQuarterRight,
      wristRight: [62, 350],
      handRight: [60, 372],
      wristLeft: [198, 350],
      handLeft: [199, 372],
      flapRight: 92,
      flapLeft: 168,
      capRight: 8,
      capLeft: 8,
    }),
  ),
} as const satisfies Readonly<Record<FramedView, Skeleton>>;
