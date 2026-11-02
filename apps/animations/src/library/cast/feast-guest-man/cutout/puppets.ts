// The man's puppet of his cut view (`canvas/puppet.ts`): the view's part
// sheet (`sheets/<view>/`, made by `film concept parts`), its parts front to
// back as the sheet's record lists them, each PNG imported by its module so a
// scene that draws him is keyed by its bytes (`tools/stamp.ts`), on the view's
// skeleton (`skeleton.ts`), with his origin at the kept box's top-left corner
// in the padded part sheet (`frames.ts`): his pixels are the sheet's, drawn at
// its one scale. Pure data.

import p1ArmLeft from './sheets/poses-1/armLeft.png' with { type: 'file' };
import p1ArmRight from './sheets/poses-1/armRight.png' with { type: 'file' };
import p1Head from './sheets/poses-1/head.png' with { type: 'file' };
import p1Robe from './sheets/poses-1/robe.png' with { type: 'file' };
import p1Torso from './sheets/poses-1/torso.png' with { type: 'file' };
import { puppetsOf } from '../../../cutout/puppets.ts';
import { CUTS } from './cut.ts';
import { FRAMES } from './frames.ts';
import { SKELETONS } from './skeleton.ts';

/**
 * His sheet's line: the median run of ink (r+g+b < 200) across his outer
 * outline, every 10th row of poses-1 from either side, is 11 px (quartiles 10
 * and 12), laid half a pixel wider as the feast mother's is; its ink is the
 * view's darkest 1 % (median 16,4,0).
 */
const LINE = { width: 11.5, ink: [16, 4, 0] } as const;

/**
 * His view's paper, the median of its kept view's border ground (its rim is
 * un-matted from it, `core/unmatte.ts`). His white robe, sleeves and
 * headcloth are painted in the paper's own colour (254,247,229 on his chest),
 * so no cloth colour is named to keep: one so near the paper would fill its
 * pockets too. Each lies inside his ink, where the un-matte's paper does not
 * reach, and the dry run holds it as his.
 */
const PAPERS = {
  'poses-1': [254, 247, 229],
} as const;

/** His puppet of each cut view, by the view's name in his sheet's views: its parts front to back, its part sheet the kept box padded (`frames.ts`), his origin at the kept box's top-left corner, held to the kept box. */
export const PUPPETS = puppetsOf({
  cast: 'feast-guest-man',
  cuts: CUTS,
  frames: FRAMES,
  skeletons: SKELETONS,
  papers: PAPERS,
  // his head turns over his still torso at the chin: the torso's headcloth reaches 12 px under it
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
