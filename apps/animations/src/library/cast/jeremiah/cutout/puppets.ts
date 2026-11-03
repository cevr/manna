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
import { PAPERS } from './papers.ts';
import { SKELETONS } from './skeleton.ts';

export const LINE = { width: 10.5, ink: [25, 9, 2] } as const;

const GRAIN = 2.25;

const LINEN = [[248, 234, 206]] as const satisfies ReadonlyArray<readonly [number, number, number]>;

export const PUPPETS = puppetsOf({
  cast: 'jeremiah',
  cuts: CUTS,
  frames: FRAMES,
  skeletons: SKELETONS,
  papers: PAPERS,
  keep: LINEN,
  grain: GRAIN,
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
