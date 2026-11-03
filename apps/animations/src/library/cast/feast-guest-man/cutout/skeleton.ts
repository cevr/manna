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

export const SKELETONS = {
  'poses-1': framed(
    keptAt('poses-1'),
    standing(BODY, {
      facing: 'front',
      hip: [206, 545],
      neck: [206, 300],
      chin: [206, 267],
      crown: [204, 0],
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
