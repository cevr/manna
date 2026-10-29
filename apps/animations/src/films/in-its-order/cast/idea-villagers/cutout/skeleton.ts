// The IDEA villagers' skeletons, one per cut view, read in the kept view's
// pixels and moved into its part sheet's frame (`framed`). Each view stands in
// the library's sense: lean from the hip, neck, head, and each arm's shoulder,
// elbow and wrist, built by `standing`. The grown villager's headcloth and
// tunic ride the lean (the torso) and the root (the robe); each sleeve's flap of
// the torso bends round its shoulder. The baby's flap band is smaller, as his
// shoulders are. Data.

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

/** The baby's body: a head, a torso and two short arms, with a flap band his size. */
const BABY: Body = {
  skin: BODY.skin,
  arms: BODY.arms,
  from: 'torso',
  band: { above: 20, below: 8, reach: 20 },
};

/** Each cut view's skeleton in its part sheet's frame, by the view's name in their sheet's views. */
export const SKELETONS = {
  // hopping, his left arm reaching out to the viewer's right
  'poses-3': framed(
    keptAt('poses-3'),
    standing(BODY, {
      facing: 'front',
      hip: [150, 290],
      neck: [165, 178],
      chin: [170, 168],
      crown: [170, 0],
      ...JOINTS['poses-3'],
      wristRight: [28, 215],
      handRight: [25, 240],
      wristLeft: [295, 175],
      handLeft: [318, 170],
      flapRight: 95,
      flapLeft: 205,
      capRight: 8,
      capLeft: 8,
    }),
  ),
  // the baby sitting, his hands between his knees
  'poses-4': framed(
    keptAt('poses-4'),
    standing(BABY, {
      facing: 'front',
      hip: [86, 185],
      neck: [86, 132],
      chin: [86, 128],
      crown: [90, 0],
      ...JOINTS['poses-4'],
      wristRight: [65, 168],
      handRight: [68, 168],
      wristLeft: [108, 168],
      handLeft: [111, 168],
      flapRight: 50,
      flapLeft: 122,
      capRight: 4,
      capLeft: 4,
    }),
  ),
  // standing facing the viewer, the arms at his sides
  'poses-6': framed(
    keptAt('poses-6'),
    standing(BODY, {
      facing: 'front',
      hip: [103, 300],
      neck: [103, 165],
      chin: [103, 150],
      crown: [103, 0],
      ...JOINTS['poses-6'],
      wristRight: [22, 300],
      handRight: [25, 322],
      wristLeft: [182, 300],
      handLeft: [180, 322],
      flapRight: 48,
      flapLeft: 158,
      capRight: 8,
      capLeft: 8,
    }),
  ),
} as const satisfies Readonly<Record<FramedView, Skeleton>>;
