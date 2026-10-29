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

/** His body in a profile to the viewer's left, which draws his left arm only: its flap reaches 25 past the shoulder, to the sleeve's back edge, where the torso behind it begins. */
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

/** His body in a profile to the viewer's right, which draws his right arm only: its flap runs from the sheet's left edge, over his back, to the sleeve's front edge. */
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
  // turned to the viewer's left: his right arm still on the viewer's left
  threeQuarterLeft: framed(
    keptAt('threeQuarterLeft'),
    standing(BODY, {
      facing: 'front',
      hip: [96, 320],
      neck: [100, 185],
      chin: [80, 166],
      crown: [108, 0],
      ...JOINTS.threeQuarterLeft,
      wristRight: [22, 344],
      handRight: [21.5, 369],
      wristLeft: [200, 344],
      handLeft: [199.5, 369.5],
      flapRight: 49,
      flapLeft: 167,
      capRight: 12,
      capLeft: 8,
    }),
  ),
  // from behind: his right arm on the viewer's right, so its flap runs out from its edge and his left arm's to the sheet's left edge
  back: framed(
    keptAt('back'),
    standing(BODY, {
      facing: 'back',
      hip: [127, 320],
      neck: [127, 200],
      chin: [127, 190],
      crown: [129, 0],
      ...JOINTS.back,
      wristRight: [226, 344],
      handRight: [225.5, 369.5],
      wristLeft: [28, 344],
      handLeft: [29, 370],
      flapRight: 199,
      flapLeft: 57,
      capRight: 14,
      capLeft: 14,
    }),
  ),
  // in profile to the viewer's left: his left arm the near one, its flap from its front edge back to the sleeve's back edge
  profileLeft: framed(
    keptAt('profileLeft'),
    standing(PROFILE_LEFT, {
      facing: 'front',
      hip: [88, 318],
      neck: [82, 180],
      chin: [56, 166],
      crown: [78, 0],
      ...JOINTS.profileLeft,
      wristLeft: [95, 345],
      handLeft: [92.5, 369],
      flapLeft: 63,
      capLeft: 12,
    }),
  ),
  // in profile to the viewer's right: his right arm the near one, its flap from the sheet's left edge to the sleeve's front edge
  profileRight: framed(
    keptAt('profileRight'),
    standing(PROFILE_RIGHT, {
      facing: 'front',
      hip: [80, 320],
      neck: [100, 180],
      chin: [128, 166],
      crown: [101, 0],
      ...JOINTS.profileRight,
      wristRight: [75, 345],
      handRight: [74.5, 369],
      flapRight: 97,
      capRight: 14,
    }),
  ),
  // turned to the viewer's right: his right arm the near one, on the viewer's left; his left arm's flap reaches the sheet's right edge
  threeQuarterRight: framed(
    keptAt('threeQuarterRight'),
    standing(BODY, {
      facing: 'front',
      hip: [137, 320],
      neck: [130, 185],
      chin: [165, 172],
      crown: [124, 0],
      ...JOINTS.threeQuarterRight,
      wristRight: [31, 344],
      handRight: [34, 369],
      wristLeft: [207, 343],
      handLeft: [205.5, 368],
      flapRight: 69.5,
      flapLeft: 180,
      capRight: 14,
      capLeft: 12,
    }),
  ),
} as const satisfies Readonly<Record<FramedView, Skeleton>>;
