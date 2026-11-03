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
  'poses-1': framed(
    keptAt('poses-1'),
    standing(BODY, {
      facing: 'front',
      hip: [191, 521],
      neck: [191, 291],
      chin: [191, 260],
      crown: [198, 0],
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
