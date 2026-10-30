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

/** Her body in a pose holding the baby: he rides her lean, and the stool (poses-2) rides the root as her robe does. */
const HOLDING: Body = {
  skin: { ...BODY.skin, baby: ['lean'] },
  arms: BODY.arms,
  from: 'torso',
  band: BODY.band,
};

/** Her body in poses-1, the baby's cup on her lean with him. */
const HOLDING_CUP: Body = {
  skin: { ...HOLDING.skin, cup: ['lean'] },
  arms: BODY.arms,
  from: 'torso',
  band: BODY.band,
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
  // the baby on her right arm, her left hand holding his cup at his mouth
  'poses-1': framed(
    keptAt('poses-1'),
    standing(HOLDING_CUP, {
      facing: 'front',
      hip: [190, 445],
      neck: [190, 255],
      chin: [190, 238],
      crown: [195, 0],
      ...JOINTS['poses-1'],
      wristRight: [80, 400],
      handRight: [112, 391],
      wristLeft: [235, 320],
      handLeft: [206, 293],
      flapRight: 85,
      flapLeft: 280,
      capRight: 8,
      capLeft: 8,
    }),
  ),
  // seated, the baby on her lap and both hands under him
  'poses-2': framed(
    keptAt('poses-2'),
    standing(HOLDING, {
      facing: 'front',
      hip: [200, 445],
      neck: [200, 260],
      chin: [200, 240],
      crown: [200, 0],
      ...JOINTS['poses-2'],
      wristRight: [150, 432],
      handRight: [181, 437],
      wristLeft: [295, 420],
      handLeft: [262, 410],
      flapRight: 100,
      flapLeft: 310,
      capRight: 8,
      capLeft: 8,
    }),
  ),
  // standing, the baby on her left arm and her right hand under him
  'poses-3': framed(
    keptAt('poses-3'),
    standing(HOLDING, {
      facing: 'front',
      hip: [170, 445],
      neck: [165, 250],
      chin: [165, 232],
      crown: [160, 0],
      ...JOINTS['poses-3'],
      wristRight: [130, 440],
      handRight: [165, 435],
      wristLeft: [255, 410],
      handLeft: [221, 397],
      flapRight: 95,
      flapLeft: 290,
      capRight: 8,
      capLeft: 8,
    }),
  ),
} as const satisfies Readonly<Record<FramedView, Skeleton>>;
