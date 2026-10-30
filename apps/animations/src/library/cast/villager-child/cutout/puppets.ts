// The villager child's puppet, one a cut view (`canvas/puppet.ts`): the view's
// part sheet (`sheets/<view>/`, made by `film concept parts`), its parts front
// to back as the sheet's record lists them, each PNG imported by its module so
// a scene that draws him is keyed by its bytes (`tools/stamp.ts`), on the
// view's skeleton (`skeleton.ts`), with his origin at the kept box's top-left
// corner in the padded part sheet (`frames.ts`): his pixels are the sheet's,
// drawn at its one scale. Pure data.

import { puppetsOf } from '../../../cutout/puppets.ts';
import { FRAMES } from './frames.ts';
import { SKELETONS } from './skeleton.ts';
import armLeft from './sheets/poses-5/armLeft.png' with { type: 'file' };
import armRight from './sheets/poses-5/armRight.png' with { type: 'file' };
import head from './sheets/poses-5/head.png' with { type: 'file' };
import torso from './sheets/poses-5/torso.png' with { type: 'file' };

/** His cut views. */
type View = 'poses-5';

/**
 * His line, which a look draws again near what moved: the median run of ink
 * (L* < 40) across his outline on poses-5 is 9 px, as on the sower's views,
 * so it is laid at 9.5; the ink is the kept poses sheet's [29, 14, 5]
 * (measured).
 */
const LINE = { width: 9.5, ink: [29, 14, 5] } as const;

/** His view's paper, the median of its kept view's border ground (its rim is un-matted from it, `core/unmatte.ts`). */
const PAPERS = {
  'poses-5': [253, 240, 219],
} as const satisfies Readonly<Record<View, readonly [number, number, number]>>;

export const PUPPETS = puppetsOf<View>({
  cast: 'villager-child',
  frames: FRAMES,
  skeletons: SKELETONS,
  papers: PAPERS,
  line: LINE,
  parts: {
    'poses-5': [
      ['armRight', armRight],
      ['head', head],
      ['armLeft', armLeft],
      ['torso', torso],
    ],
  },
});
