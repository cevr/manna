import { puppetsOf } from '../../../cutout/puppets.ts';
import { CUTS } from './cut.ts';
import { FRAMES } from './frames.ts';
import { SKELETONS } from './skeleton.ts';
import armLeft from './sheets/poses-5/armLeft.png' with { type: 'file' };
import armRight from './sheets/poses-5/armRight.png' with { type: 'file' };
import head from './sheets/poses-5/head.png' with { type: 'file' };
import torso from './sheets/poses-5/torso.png' with { type: 'file' };

type View = 'poses-5';

const LINE = { width: 9.5, ink: [29, 14, 5] } as const;

const PAPERS = {
  'poses-5': [253, 240, 219],
} as const satisfies Readonly<Record<View, readonly [number, number, number]>>;

export const PUPPETS = puppetsOf<View>({
  cast: 'villager-child',
  cuts: CUTS,
  frames: FRAMES,
  skeletons: SKELETONS,
  papers: PAPERS,
  line: LINE,
  parts: {
    'poses-5': [
      ['armRight', armRight],
      ['head', head],
      ['armLeft', armLeft],
      ['torso', torso],
    ],
  },
});
