import p3ArmLeft from './sheets/poses-3/armLeft.png' with { type: 'file' };
import p3ArmRight from './sheets/poses-3/armRight.png' with { type: 'file' };
import p3Head from './sheets/poses-3/head.png' with { type: 'file' };
import p3Robe from './sheets/poses-3/robe.png' with { type: 'file' };
import p3Torso from './sheets/poses-3/torso.png' with { type: 'file' };
import p4ArmLeft from './sheets/poses-4/armLeft.png' with { type: 'file' };
import p4ArmRight from './sheets/poses-4/armRight.png' with { type: 'file' };
import p4Head from './sheets/poses-4/head.png' with { type: 'file' };
import p4Torso from './sheets/poses-4/torso.png' with { type: 'file' };
import p6ArmLeft from './sheets/poses-6/armLeft.png' with { type: 'file' };
import p6ArmRight from './sheets/poses-6/armRight.png' with { type: 'file' };
import p6Head from './sheets/poses-6/head.png' with { type: 'file' };
import p6Robe from './sheets/poses-6/robe.png' with { type: 'file' };
import p6Torso from './sheets/poses-6/torso.png' with { type: 'file' };
import s15ArmLeft from './sheets/single-15/armLeft.png' with { type: 'file' };
import s15ArmRight from './sheets/single-15/armRight.png' with { type: 'file' };
import s15Head from './sheets/single-15/head.png' with { type: 'file' };
import s15Robe from './sheets/single-15/robe.png' with { type: 'file' };
import s15Torso from './sheets/single-15/torso.png' with { type: 'file' };
import { puppetsOf } from '../../../../../library/cutout/puppets.ts';
import { CUTS } from './cut.ts';
import { FRAMES } from './frames.ts';
import { PAPERS } from './papers.ts';
import { SKELETONS } from './skeleton.ts';

const HOPPING_LINE = { width: 10.5, ink: [6, 2, 0] } as const;

const LINE = { width: 8.5, ink: [6, 1, 0] } as const;

const SINGLE_LINE = { width: 18.5, ink: [1, 0, 0] } as const;

const GRAIN = 2.75;

const SHARED = {
  cast: 'idea-villagers',
  cuts: CUTS,
  frames: FRAMES,
  skeletons: SKELETONS,
  papers: PAPERS,
  grain: GRAIN,
} as const;

const HOPPING = puppetsOf<'poses-3'>({
  ...SHARED,
  line: HOPPING_LINE,
  parts: {
    'poses-3': [
      ['armLeft', p3ArmLeft],
      ['armRight', p3ArmRight],
      ['head', p3Head],
      ['robe', p3Robe],
      ['torso', p3Torso],
    ],
  },
});

const POSES = puppetsOf<'poses-4' | 'poses-6'>({
  ...SHARED,
  line: LINE,
  parts: {
    'poses-4': [
      ['armRight', p4ArmRight],
      ['armLeft', p4ArmLeft],
      ['head', p4Head],
      ['torso', p4Torso],
    ],
    'poses-6': [
      ['armRight', p6ArmRight],
      ['armLeft', p6ArmLeft],
      ['head', p6Head],
      ['robe', p6Robe],
      ['torso', p6Torso],
    ],
  },
});

const SINGLE = puppetsOf<'single-15'>({
  ...SHARED,
  line: SINGLE_LINE,
  parts: {
    'single-15': [
      ['armRight', s15ArmRight],
      ['armLeft', s15ArmLeft],
      ['head', s15Head],
      ['robe', s15Robe],
      ['torso', s15Torso],
    ],
  },
});

export const PUPPETS = { ...HOPPING, ...POSES, ...SINGLE };
