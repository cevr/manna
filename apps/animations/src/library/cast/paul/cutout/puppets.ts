// Paul's puppets, one a cut view (`canvas/puppet.ts`): each view's part sheet
// (`sheets/<view>/`, made by `film concept parts`), its parts front to back as
// the sheet's record lists them, each PNG imported by its module so a scene
// that draws him is keyed by its bytes (`tools/stamp.ts`), on the view's
// skeleton (`skeleton.ts`), with his origin at the kept box's top-left corner
// in the padded part sheet (`frames.ts`): his pixels are the sheet's, drawn at
// its one scale. Each declares the kept view it is held to (`concept`). Pure.

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
import { FRAMES } from './frames.ts';
import { SKELETONS } from './skeleton.ts';

/**
 * His sheet's line, which a look draws again near what moved (L3): the
 * median run of ink (luma < 90) across his outer outline at his shoulders and
 * mantle is 11 px in every view (quartiles 10 and 12 or 13), laid half a pixel
 * wider as the other members' are, in his cut's ink (`cut.ts`, 42,21,7).
 */
export const LINE = { width: 11.5, ink: [42, 21, 7] } as const;

/**
 * Each cut view's paper, the median of its kept view's border ground (its rim
 * is un-matted from it, `core/unmatte.ts`).
 *
 * He names no `keep` colour and no `grain`. His lightest colours lie far from
 * his paper: the lightest 5 % of his figure is at least 50.5 from its view's
 * paper (heads-6; 50.6 to 57.3 in the others), while his paper's grain is at
 * most 3.658 (the 95th percentile on heads-1). That distance is why the
 * un-matte needs neither, and his fit rows bear it out: they lose 0 figure
 * pixels without them.
 */
export const PAPERS = {
  'heads-1': [249, 232, 208],
  'heads-2': [248, 232, 208],
  'heads-3': [249, 232, 208],
  'heads-4': [248, 232, 208],
  'heads-5': [249, 232, 209],
  'heads-6': [248, 231, 207],
} as const satisfies Readonly<Record<keyof typeof SKELETONS, readonly [number, number, number]>>;

/**
 * Each cut view's puppet, by the view's name in his sheet's views: its parts
 * front to back, its part sheet the kept box padded (`frames.ts`), his origin
 * at the kept box's top-left corner, held to the kept box
 * (`library/cutout/puppets.ts`).
 *
 * heads-1, heads-2 and heads-3 leave their sheet's `neighbour` part out: it
 * holds the art of the view beside his on the heads sheet (heads-2's head in
 * heads-1; heads-1's shoulder and heads-3's head in heads-2; heads-2 in
 * heads-3), which reaches into his kept box, so that no figure pixel of the
 * box is left in no part (`cut.ts`). It is that view's own art, drawn by that
 * view's puppet, never this one.
 */
export const PUPPETS = puppetsOf({
  cast: 'paul',
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
