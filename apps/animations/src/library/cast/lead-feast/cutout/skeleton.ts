import type { Skeleton } from '@manna/film/core';
import { type Body, framed, standing } from '../../../cutout/skeleton.ts';
import { type FramedView, keptAt } from './frames.ts';
import { JOINTS } from './joints.ts';

/** His parts as his part sheets name them, each on its bones; his sleeves' flaps from his torso, in a band 50 px above each shoulder to 12 below, reaching 60 past it. */
const BODY: Body = {
  skin: {
    head: ['neck', 'head'],
    torso: ['lean'],
    sash: ['lean'],
    armRight: ['shoulderRight', 'elbowRight', 'wristRight', 'lean'],
    armLeft: ['shoulderLeft', 'elbowLeft', 'wristLeft', 'lean'],
  },
  arms: { right: 'armRight', left: 'armLeft' },
  from: 'torso',
  band: { above: 50, below: 12, reach: 60 },
};

/** Each cut view's skeleton in its part sheet's frame, by the view's name in his sheets' views. */
export const SKELETONS = {
  front: framed(
    keptAt('front'),
    standing(BODY, {
      facing: 'front',
      hip: [123, 360],
      neck: [123, 205],
      chin: [122, 185],
      crown: [120, 20],
      ...JOINTS.front,
      wristRight: [31, 405],
      handRight: [29.5, 429],
      wristLeft: [215, 405],
      handLeft: [216.5, 428.5],
      flapRight: 51,
      flapLeft: 199,
      capRight: 13,
      capLeft: 13,
    }),
  ),
  threeQuarterLeft: framed(
    keptAt('threeQuarterLeft'),
    standing(BODY, {
      facing: 'front',
      hip: [110, 360],
      neck: [107, 215],
      chin: [106, 195],
      crown: [100, 20],
      ...JOINTS.threeQuarterLeft,
      wristRight: [22, 405],
      handRight: [20, 430],
      wristLeft: [183, 405],
      handLeft: [184, 430],
      flapRight: 45,
      flapLeft: 152,
      capRight: 11,
      capLeft: 13,
    }),
  ),
  'single-1': framed(
    keptAt('single-1'),
    standing(BODY, {
      facing: 'front',
      hip: [300, 680],
      neck: [310, 380],
      chin: [310, 360],
      crown: [300, 10],
      ...JOINTS['single-1'],
      wristRight: [72, 432],
      handRight: [75, 385],
      wristLeft: [485, 775],
      handLeft: [488, 820],
      flapRight: 205,
      flapLeft: 430,
      capRight: 13,
      capLeft: 13,
    }),
  ),
  'single-9': framed(
    keptAt('single-9'),
    standing(BODY, {
      facing: 'front',
      hip: [301, 660],
      neck: [308, 385],
      chin: [308, 365],
      crown: [300, 5],
      ...JOINTS['single-9'],
      limbs: ['right', 'left'],
      wristRight: [77, 406],
      handRight: [73, 338],
      wristLeft: [462, 688],
      handLeft: [442, 718],
      flapRight: 200,
      flapLeft: 432,
      capRight: 13,
      capLeft: 13,
    }),
  ),
  'heads-4': framed(keptAt('heads-4'), {
    bones: [
      { name: 'lean', pivot: [120, 336], tip: [120, 232] },
      { name: 'head', parent: 'lean', pivot: [120, 232], tip: [120, 30] },
    ],
    skin: { head: ['head'], torso: ['lean'] },
    root: [120, 336],
  }),
  'single-5': framed(keptAt('single-5'), {
    bones: [
      { name: 'lean', pivot: [152, 417], tip: [152, 286] },
      { name: 'head', parent: 'lean', pivot: [152, 286], tip: [152, 35] },
    ],
    skin: { head: ['head'], torso: ['lean'] },
    root: [152, 417],
  }),
} as const satisfies Readonly<Record<FramedView, Skeleton>>;
