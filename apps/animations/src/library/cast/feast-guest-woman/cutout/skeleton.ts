// The woman's skeleton for her cut view, read in the kept view's pixels and
// moved into its part sheet's frame (`framed`). She sits: lean from the hip at
// her lap, neck, head, and each arm's shoulder, elbow and wrist, built by the
// library's `standing`. Her veil's drape below her chin rides the lean with
// her torso, as the feast mother's veil does; her robe, stool and sandals ride
// the root; each arm's flap of the torso bends round its shoulder. Data.

import type { Skeleton } from '@manna/film/core';
import { type Body, framed, standing } from '../../../cutout/skeleton.ts';
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

/** Her cut view's skeleton in its part sheet's frame, by the view's name in her sheet's views. */
export const SKELETONS = {
  // seated facing the viewer, each hand on its knee
  'poses-1': framed(
    keptAt('poses-1'),
    standing(BODY, {
      facing: 'front',
      hip: [191, 521],
      neck: [191, 291],
      chin: [191, 260],
      crown: [198, 0],
      painted: {
        right: '72-pose sweep: ghost 692 > 0 at elbow/wrist 25/-120',
        left: '72-pose sweep: ghost 594 > 0 at elbow/wrist 115/30',
      },
      ...JOINTS['poses-1'],
      wristRight: [76, 503],
      handRight: [100, 529],
      wristLeft: [306, 503],
      handLeft: [282, 529],
      flapRight: 115,
      flapLeft: 265,
      capRight: 8,
      capLeft: 8,
    }),
  ),
} as const satisfies Readonly<Record<FramedView, Skeleton>>;
