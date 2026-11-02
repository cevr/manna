// The filler bases' puppets, one a cut view (`canvas/puppet.ts`): each view's
// part sheet (`sheets/<view>/`, written by their cutter, `sheets-cut.ts`), its
// parts front to back as the cut lists them, each PNG imported by its module
// so a scene that draws a base is keyed by its bytes (`tools/stamp.ts`), on
// the view's skeleton (`skeleton.ts`), with the origin at the kept box's
// top-left corner in the padded part sheet (`frames.ts`): the pixels are the
// sheet's, drawn at its one scale, which a crowd's draw scale shrinks. Each
// declares the kept view it is held to (`concept`). Pure data.

import p1Head from './sheets/poses-1/head.png' with { type: 'file' };
import p1Torso from './sheets/poses-1/torso.png' with { type: 'file' };
import p2Head from './sheets/poses-2/head.png' with { type: 'file' };
import p2Torso from './sheets/poses-2/torso.png' with { type: 'file' };
import p3Head from './sheets/poses-3/head.png' with { type: 'file' };
import p3Torso from './sheets/poses-3/torso.png' with { type: 'file' };
import p4Head from './sheets/poses-4/head.png' with { type: 'file' };
import p4Torso from './sheets/poses-4/torso.png' with { type: 'file' };
import { puppetsOf } from '../../../cutout/puppets.ts';
import { CUTS } from './cut.ts';
import { FRAMES } from './frames.ts';
import { SKELETONS } from './skeleton.ts';

/**
 * Their sheet's line, which a look draws again near what moved: about 11 px
 * across their outer outline, as the feast's guest man's, laid half a pixel
 * wider, in the sheet's outline ink (about 16,4,0, `cut.ts`).
 */
export const LINE = { width: 11.5, ink: [16, 4, 0] } as const;

/**
 * Each cut view's paper, the sheet's ground (about 249,232,208 in every
 * view), which its rim is un-matted from (`core/unmatte.ts`). The grown
 * pair's cream robe is painted in nearly that colour, but each robe lies
 * inside its ink, where the un-matte's paper does not reach, and their cutter
 * dyes it linen.
 */
export const PAPERS = {
  'poses-1': [249, 232, 208],
  'poses-2': [249, 232, 208],
  'poses-3': [249, 232, 208],
  'poses-4': [249, 232, 208],
} as const satisfies Readonly<Record<keyof typeof SKELETONS, readonly [number, number, number]>>;

/**
 * Each cut view's puppet, by the view's name in their sheet's views: its
 * parts front to back, its part sheet the kept box padded (`frames.ts`), the
 * origin at the kept box's top-left corner, held to the kept box
 * (`library/cutout/puppets.ts`).
 */
export const PUPPETS = puppetsOf({
  cast: 'filler-bases',
  cuts: CUTS,
  frames: FRAMES,
  skeletons: SKELETONS,
  papers: PAPERS,
  // each head turns over its still torso at the face's lower edge: the torso's chin shadow and neck reach 12 px under it
  underlap: { head: 12 },
  line: LINE,
  parts: {
    'poses-1': [
      ['head', p1Head],
      ['torso', p1Torso],
    ],
    'poses-2': [
      ['head', p2Head],
      ['torso', p2Torso],
    ],
    'poses-3': [
      ['head', p3Head],
      ['torso', p3Torso],
    ],
    'poses-4': [
      ['head', p4Head],
      ['torso', p4Torso],
    ],
  },
});
