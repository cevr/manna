// The villager toddler's puppets, one a cut view (`canvas/puppet.ts`): each
// view's part sheet (`sheets/<view>/`, made by `film concept parts`), its
// parts front to back as the sheet's record lists them, each PNG imported by
// its module so a scene that draws them is keyed by its bytes
// (`tools/stamp.ts`), on the view's skeleton (`skeleton.ts`), with their
// origin at the kept box's top-left corner in the padded part sheet
// (`frames.ts`): their pixels are the sheet's, drawn at its one scale. Pure
// data.

import { puppetsOf } from '../../../cutout/puppets.ts';
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

/** Their cut views. */
type View = 'poses-1' | 'poses-2';

/**
 * Their line, which a look draws again near what moved: the median run of
 * ink (L* < 40) across their outline is 9 px on both views, as on the
 * sower's, so it is laid at 9.5; the ink is the kept poses sheet's
 * [29, 14, 5] (measured).
 */
const LINE = { width: 9.5, ink: [29, 14, 5] } as const;

/** Each view's paper, the median of its kept view's border ground (its rim is un-matted from it, `core/unmatte.ts`). */
const PAPERS = {
  'poses-1': [253, 241, 221],
  'poses-2': [253, 240, 219],
} as const satisfies Readonly<Record<View, readonly [number, number, number]>>;

export const PUPPETS = puppetsOf<View>({
  cast: 'villager-toddler',
  frames: FRAMES,
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
