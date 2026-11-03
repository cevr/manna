import { puppetsOf } from '../../../cutout/puppets.ts';
import { CUTS } from './cut.ts';
import { FRAMES } from './frames.ts';
import { SKELETONS } from './skeleton.ts';
import armLeft1 from './sheets/poses-1/armLeft.png' with { type: 'file' };
import footLeft1 from './sheets/poses-1/footLeft.png' with { type: 'file' };
import footRight1 from './sheets/poses-1/footRight.png' with { type: 'file' };
import head1 from './sheets/poses-1/head.png' with { type: 'file' };
import shadow1 from './sheets/poses-1/shadow.png' with { type: 'file' };
import torso1 from './sheets/poses-1/torso.png' with { type: 'file' };
import armLeft2 from './sheets/poses-2/armLeft.png' with { type: 'file' };
import armRight2 from './sheets/poses-2/armRight.png' with { type: 'file' };
import head2 from './sheets/poses-2/head.png' with { type: 'file' };
import torso2 from './sheets/poses-2/torso.png' with { type: 'file' };

type View = 'poses-1' | 'poses-2';

const LINE = { width: 9.5, ink: [29, 14, 5] } as const;

const PAPERS = {
  'poses-1': [253, 241, 221],
  'poses-2': [253, 240, 219],
} as const satisfies Readonly<Record<View, readonly [number, number, number]>>;

export const PUPPETS = puppetsOf<View>({
  cast: 'villager-toddler',
  frames: FRAMES,
  cuts: CUTS,
  skeletons: SKELETONS,
  papers: PAPERS,
  line: LINE,
  parts: {
    'poses-1': [
      ['armLeft', armLeft1],
      ['head', head1],
      ['footLeft', footLeft1],
      ['footRight', footRight1],
      ['shadow', shadow1],
      ['torso', torso1],
    ],
    'poses-2': [
      ['armRight', armRight2],
      ['armLeft', armLeft2],
      ['head', head2],
      ['torso', torso2],
    ],
  },
});
