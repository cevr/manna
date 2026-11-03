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
  band: { above: 20, below: 12, reach: 40 },
};

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
