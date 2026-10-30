// Jeremiah's puppets, one a cut view (`canvas/puppet.ts`): each view's part
// sheet (`sheets/<view>/`, made by `film concept parts`), its parts front to
// back as the sheet's record lists them, each PNG imported by its module so a
// scene that draws him is keyed by its bytes (`tools/stamp.ts`), on the view's
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
 * robe is 10 px on heads-1 to heads-3 and 9 px on heads-4 to heads-6
 * (quartiles 9 and 10 in every view), the larger laid half a pixel wider as
 * the other members' are, in his cut's ink (`cut.ts`, 25,9,2).
 */
export const LINE = { width: 10.5, ink: [25, 9, 2] } as const;

/**
 * His paper's grain, luma (`core/unmatte.ts`, `grain`): the 95th percentile of
 * how far his kept views' border ground runs darker than its median paper is
 * 1.914 (heads-1), 2.228 (heads-2, heads-4, heads-6) and 2.114 (heads-3,
 * heads-5); the largest, rounded up. With it his rim keeps 1695 to 2013 px
 * whole as cloth in each view, and fills none of the paper pockets his sheet
 * shows between his beard, headcloth and robe (542 to 843 px a view).
 */
const GRAIN = 2.25;

/**
 * His linen's lightest fold, kept as his where it lies nearer it than the
 * paper (`core/unmatte.ts`, `keep`): with his grain it fills none of his
 * sheet's paper pockets in any view and keeps 47, 0, 10, 1, 0 and 13 rim px
 * whole (heads-1 to heads-6). A lighter fold (252,240,213 or 250,237,210)
 * fills up to 13 pocket px a view, and a darker one keeps none.
 */
const LINEN = [[248, 234, 206]] as const satisfies ReadonlyArray<readonly [number, number, number]>;

/** Each cut view's paper, the median of its kept view's border ground (its rim is un-matted from it, `core/unmatte.ts`). */
export const PAPERS = {
  'heads-1': [252, 243, 226],
  'heads-2': [252, 243, 226],
  'heads-3': [252, 243, 226],
  'heads-4': [252, 243, 226],
  'heads-5': [252, 243, 226],
  'heads-6': [252, 243, 226],
} as const satisfies Readonly<Record<keyof typeof SKELETONS, readonly [number, number, number]>>;

/**
 * Each cut view's puppet, by the view's name in his sheet's views: its parts
 * front to back, its part sheet the kept box padded (`frames.ts`), his origin
 * at the kept box's top-left corner, held to the kept box
 * (`library/cutout/puppets.ts`). His views stand apart on the heads sheet, so
 * no view has a `neighbour` part.
 */
export const PUPPETS = puppetsOf({
  cast: 'jeremiah',
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
