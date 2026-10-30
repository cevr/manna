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
// 3 px above it (y282). The sleeve takes its shoulder's flap of torso. Their
// kept pose sitting (poses-2) faces the viewer, both arms hanging, and stands
// as `front` does; its root is their seat, the ground their heels, legs and
// seat. Pure data.

import type { Skeleton } from '@manna/film/core';
import { type Body, framed, standing } from '../../../cutout/skeleton.ts';
import { type FramedView, keptAt } from './frames.ts';
import { JOINTS } from './joints.ts';

/** Their parts as their part sheets name them (`cut.ts`), each on its bones; their sleeves' flaps from their torso, in a band 20 px above each shoulder to 12 below, reaching 40 past it. */
const BODY: Body = {
  skin: {
    head: ['neck', 'head'],
    torso: ['lean'],
    armRight: ['shoulderRight', 'elbowRight', 'wristRight', 'lean'],
    armLeft: ['shoulderLeft', 'elbowLeft', 'wristLeft', 'lean'],
  },
  arms: { right: 'armRight', left: 'armLeft' },
  from: 'torso',
  band: { above: 20, below: 12, reach: 40 },
};

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
  // sitting, facing the viewer, as `front`: their right arm on the viewer's left, its flap out from the sleeve's guessed inner edge to the sheet's left edge
  'poses-2': framed(
    keptAt('poses-2'),
    standing(BODY, {
      facing: 'front',
      hip: [84, 215],
      neck: [84, 136],
      chin: [84, 128],
      crown: [84, 0],
      ...JOINTS['poses-2'],
      wristRight: [38, 170],
      handRight: [40, 184],
      wristLeft: [130, 170],
      handLeft: [129, 184],
      flapRight: 56,
      flapLeft: 110,
      capRight: 14,
      capLeft: 14,
    }),
  ),
} as const satisfies Readonly<Record<FramedView, Skeleton>>;
