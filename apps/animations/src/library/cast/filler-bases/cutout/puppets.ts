import p1Band from './sheets/poses-1/band.png' with { type: 'file' };
import p1Beard from './sheets/poses-1/beard.png' with { type: 'file' };
import p1Head from './sheets/poses-1/head.png' with { type: 'file' };
import p1HeadCovered from './sheets/poses-1/head-covered.png' with { type: 'file' };
import p1Headwear from './sheets/poses-1/headwear.png' with { type: 'file' };
import p1Mantle from './sheets/poses-1/mantle.png' with { type: 'file' };
import p1Torso from './sheets/poses-1/torso.png' with { type: 'file' };
import p2Head from './sheets/poses-2/head.png' with { type: 'file' };
import p2Mantle from './sheets/poses-2/mantle.png' with { type: 'file' };
import p2Torso from './sheets/poses-2/torso.png' with { type: 'file' };
import p3Beard from './sheets/poses-3/beard.png' with { type: 'file' };
import p3Head from './sheets/poses-3/head.png' with { type: 'file' };
import p3HeadCovered from './sheets/poses-3/head-covered.png' with { type: 'file' };
import p3Headwear from './sheets/poses-3/headwear.png' with { type: 'file' };
import p3Mantle from './sheets/poses-3/mantle.png' with { type: 'file' };
import p3Torso from './sheets/poses-3/torso.png' with { type: 'file' };
import p4Head from './sheets/poses-4/head.png' with { type: 'file' };
import p4Mantle from './sheets/poses-4/mantle.png' with { type: 'file' };
import p4Torso from './sheets/poses-4/torso.png' with { type: 'file' };
import type { Ramp } from '@manna/film/canvas';
import { Option, Record as Records } from 'effect';
import { type CutPuppet, puppetsOf } from '../../../cutout/puppets.ts';
import { CUTS } from './cut.ts';
import { FRAMES } from './frames.ts';
import { RAMPS } from './sheets/ramps.ts';
import { SKELETONS } from './skeleton.ts';

export const LINE = { width: 11.5, ink: [16, 4, 0] } as const;

export const PAPERS = {
  'poses-1': [249, 232, 208],
  'poses-2': [249, 232, 208],
  'poses-3': [249, 232, 208],
  'poses-4': [249, 232, 208],
} as const satisfies Readonly<Record<keyof typeof SKELETONS, readonly [number, number, number]>>;

const BUSTS = puppetsOf({
  cast: 'filler-bases',
  cuts: CUTS,
  frames: FRAMES,
  skeletons: SKELETONS,
  papers: PAPERS,
  underlap: { head: 12 },
  line: LINE,
  parts: {
    'poses-1': [
      ['beard', p1Beard],
      ['band', p1Band],
      ['headwear', p1Headwear],
      ['mantle', p1Mantle],
      ['head', p1Head],
      ['torso', p1Torso],
    ],
    'poses-2': [
      ['mantle', p2Mantle],
      ['head', p2Head],
      ['torso', p2Torso],
    ],
    'poses-3': [
      ['beard', p3Beard],
      ['headwear', p3Headwear],
      ['mantle', p3Mantle],
      ['head', p3Head],
      ['torso', p3Torso],
    ],
    'poses-4': [
      ['mantle', p4Mantle],
      ['head', p4Head],
      ['torso', p4Torso],
    ],
  },
});

const ramped = (puppet: CutPuppet, ramps: Readonly<Record<string, Ramp>>): CutPuppet => ({
  ...puppet,
  parts: puppet.parts.map((part) =>
    Option.match(Option.fromUndefinedOr(ramps[part.name]), {
      onNone: () => part,
      onSome: (ramp) => ({ ...part, ramp }),
    }),
  ),
});

export const HEAD_COVERED = 'head-covered';

const COVERED: Partial<Record<keyof typeof BUSTS, string>> = {
  'poses-1': p1HeadCovered,
  'poses-3': p3HeadCovered,
};

const covered = (puppet: CutPuppet, png: Option.Option<string>): CutPuppet =>
  Option.match(png, {
    onNone: () => puppet,
    onSome: (p) => ({ ...puppet, drawings: [{ name: HEAD_COVERED, png: p, part: 'head' }] }),
  });

export const PUPPETS = Records.map(BUSTS, (puppet, view) =>
  covered(ramped(puppet, RAMPS[view]), Option.fromUndefinedOr(COVERED[view])),
);
