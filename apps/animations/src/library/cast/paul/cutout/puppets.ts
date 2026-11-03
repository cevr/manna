import heads1Head from './sheets/heads-1/head.png' with { type: 'file' };
import heads1Torso from './sheets/heads-1/torso.png' with { type: 'file' };
import heads2Head from './sheets/heads-2/head.png' with { type: 'file' };
import heads2Torso from './sheets/heads-2/torso.png' with { type: 'file' };
import heads3Head from './sheets/heads-3/head.png' with { type: 'file' };
import heads3Torso from './sheets/heads-3/torso.png' with { type: 'file' };
import heads4Head from './sheets/heads-4/head.png' with { type: 'file' };
import heads4Torso from './sheets/heads-4/torso.png' with { type: 'file' };
import heads5Head from './sheets/heads-5/head.png' with { type: 'file' };
import heads5Torso from './sheets/heads-5/torso.png' with { type: 'file' };
import heads6Head from './sheets/heads-6/head.png' with { type: 'file' };
import heads6Torso from './sheets/heads-6/torso.png' with { type: 'file' };
import { puppetsOf } from '../../../cutout/puppets.ts';
import { CUTS } from './cut.ts';
import { FRAMES } from './frames.ts';
import { SKELETONS } from './skeleton.ts';

export const LINE = { width: 11.5, ink: [42, 21, 7] } as const;

export const PAPERS = {
  'heads-1': [249, 232, 208],
  'heads-2': [248, 232, 208],
  'heads-3': [249, 232, 208],
  'heads-4': [248, 232, 208],
  'heads-5': [249, 232, 209],
  'heads-6': [248, 231, 207],
} as const satisfies Readonly<Record<keyof typeof SKELETONS, readonly [number, number, number]>>;

export const PUPPETS = puppetsOf({
  cast: 'paul',
  cuts: CUTS,
  frames: FRAMES,
  skeletons: SKELETONS,
  papers: PAPERS,
  line: LINE,
  parts: {
    'heads-1': [
      ['head', heads1Head],
      ['torso', heads1Torso],
    ],
    'heads-2': [
      ['head', heads2Head],
      ['torso', heads2Torso],
    ],
    'heads-3': [
      ['head', heads3Head],
      ['torso', heads3Torso],
    ],
    'heads-4': [
      ['head', heads4Head],
      ['torso', heads4Torso],
    ],
    'heads-5': [
      ['head', heads5Head],
      ['torso', heads5Torso],
    ],
    'heads-6': [
      ['head', heads6Head],
      ['torso', heads6Torso],
    ],
  },
});
