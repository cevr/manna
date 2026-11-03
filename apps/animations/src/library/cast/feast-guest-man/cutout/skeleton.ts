// The man's skeleton for his cut view, read in the kept view's pixels and
// moved into its part sheet's frame (`framed`). He sits: lean from the hip at
// his lap, neck, head, and each arm's shoulder, elbow and wrist, built by the
// library's `standing`. His headcloth's drape below his chin rides the lean
// with his torso; his robe, stool and sandals ride the root; each sleeve's
// flap of the torso bends round its shoulder. Data.

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

/** His cut view's skeleton in its part sheet's frame, by the view's name in his sheet's views. */
export const SKELETONS = {
  // seated facing the viewer, each hand on its knee
  'poses-1': framed(
    keptAt('poses-1'),
    standing(BODY, {
      facing: 'front',
      hip: [206, 545],
      neck: [206, 300],
      chin: [206, 267],
      crown: [204, 0],
      painted: {
        right:
          '72-pose sweep: exposed 17 > 8 at elbow/wrist 120/-120; unprotected 10 > 0 at elbow/wrist 100/-120; ghost 139 > 0 at elbow/wrist 40/-60',
      },
      ...JOINTS['poses-1'],
      wristRight: [70, 505],
      handRight: [92, 534],
      wristLeft: [338, 505],
      handLeft: [320, 537],
      flapRight: 115,
      flapLeft: 296,
      capRight: 8,
      capLeft: 8,
    }),
  ),
} as const satisfies Readonly<Record<FramedView, Skeleton>>;
