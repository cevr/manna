// The villager child's skeletons, one a cut view (`core/puppet.ts`), read in
// view pixels and moved into its part sheet's frame (`frames.ts`) by the
// shared skeleton (`library/cutout/skeleton.ts`): his lean from his hip to the
// base of his neck, his neck and head above it, and each arm's shoulder, elbow
// and wrist on the joints his cut records (`joints.ts`), the wrist at the cuff
// and its tip at his circle hand's middle. His kept pose writing on a board
// (poses-5) is cut as drawn, its skeleton written out: his hanging right arm's
// flap runs as `front` does, from its inner crease to the sheet's left edge;
// his raised left arm's flap covers the sleeve and hand. Pure data.

import type { Skeleton } from '@manna/film/core';
import { type Body, framed } from '../../../cutout/skeleton.ts';
import { type FramedView, keptAt } from './frames.ts';
import { JOINTS } from './joints.ts';

const SKIN: Body['skin'] = {
  head: ['neck', 'head'],
  torso: ['lean'],
  armRight: ['shoulderRight', 'elbowRight', 'wristRight', 'lean'],
  armLeft: ['shoulderLeft', 'elbowLeft', 'wristLeft', 'lean'],
};

export const SKELETONS = {
  'poses-5': framed(keptAt('poses-5'), {
    bones: [
      { name: 'lean', pivot: [105, 330], tip: [88, 150] },
      { name: 'neck', parent: 'lean', pivot: [88, 150], tip: [90, 135] },
      { name: 'head', parent: 'neck', pivot: [90, 135], tip: [75, 0] },
      {
        name: 'shoulderRight',
        parent: 'lean',
        pivot: JOINTS['poses-5'].shoulderRight,
        tip: JOINTS['poses-5'].elbowRight,
      },
      {
        name: 'elbowRight',
        parent: 'shoulderRight',
        pivot: JOINTS['poses-5'].elbowRight,
        tip: [42, 252],
      },
      { name: 'wristRight', parent: 'elbowRight', pivot: [42, 252], tip: [46, 276] },
      {
        name: 'shoulderLeft',
        parent: 'lean',
        pivot: JOINTS['poses-5'].shoulderLeft,
        tip: JOINTS['poses-5'].elbowLeft,
      },
      {
        name: 'elbowLeft',
        parent: 'shoulderLeft',
        pivot: JOINTS['poses-5'].elbowLeft,
        tip: [180, 108],
      },
      { name: 'wristLeft', parent: 'elbowLeft', pivot: [180, 108], tip: [200, 86] },
    ],
    skin: SKIN,
    flaps: [
      {
        part: 'armRight',
        from: 'torso',
        bone: 'shoulderRight',
        body: 'lean',
        cap: 12,
        region: [
          [-1, 110],
          [72, 110],
          [72, 172],
          [-1, 172],
        ],
      },
      {
        part: 'armLeft',
        from: 'torso',
        bone: 'shoulderLeft',
        body: 'lean',
        cap: 12,
        region: [
          [130, 50],
          [227, 50],
          [227, 200],
          [130, 200],
        ],
      },
    ],
    root: [105, 330],
  }),
} as const satisfies Readonly<Record<FramedView, Skeleton>>;
