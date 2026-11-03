import p1ArmLeft from './sheets/poses-1/armLeft.png' with { type: 'file' };
import p1ArmRight from './sheets/poses-1/armRight.png' with { type: 'file' };
import p1Head from './sheets/poses-1/head.png' with { type: 'file' };
import p1Robe from './sheets/poses-1/robe.png' with { type: 'file' };
import p1Torso from './sheets/poses-1/torso.png' with { type: 'file' };
import { puppetsOf } from '../../../cutout/puppets.ts';
import { CUTS } from './cut.ts';
import { FRAMES } from './frames.ts';
import { SKELETONS } from './skeleton.ts';

const LINE = { width: 11.5, ink: [16, 4, 0] } as const;

const PAPERS = {
  'poses-1': [254, 247, 229],
} as const;

export const PUPPETS = puppetsOf({
  cast: 'feast-guest-man',
  cuts: CUTS,
  frames: FRAMES,
  skeletons: SKELETONS,
  papers: PAPERS,
  underlap: { head: 12 },
  line: LINE,
  parts: {
    'poses-1': [
      ['armRight', p1ArmRight],
      ['armLeft', p1ArmLeft],
      ['head', p1Head],
      ['robe', p1Robe],
      ['torso', p1Torso],
    ],
  },
});
