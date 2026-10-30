// The series lead's puppets, one a cut view (`canvas/puppet.ts`): each
// view's part sheet (`sheets/<view>/`, made by `film concept parts`), its
// parts front to back as the sheet's record lists them, each PNG imported
// by its module so a scene that draws him is keyed by its bytes
// (`tools/stamp.ts`), on the view's skeleton (`skeleton.ts`), with his origin
// at the kept box's top-left corner in the padded part sheet (`frames.ts`):
// his pixels are the sheet's, drawn at its
// one scale. Each declares the kept view it is held to (`concept`). Pure.

import frontArmLeft from './sheets/front/armLeft.png' with { type: 'file' };
import frontArmRight from './sheets/front/armRight.png' with { type: 'file' };
import frontFootLeft from './sheets/front/footLeft.png' with { type: 'file' };
import frontFootRight from './sheets/front/footRight.png' with { type: 'file' };
import frontHead from './sheets/front/head.png' with { type: 'file' };
import frontRobe from './sheets/front/robe.png' with { type: 'file' };
import frontSash from './sheets/front/sash.png' with { type: 'file' };
import frontShadow from './sheets/front/shadow.png' with { type: 'file' };
import frontTorso from './sheets/front/torso.png' with { type: 'file' };
import heads4Head from './sheets/heads-4/head.png' with { type: 'file' };
import heads4Torso from './sheets/heads-4/torso.png' with { type: 'file' };
import single1ArmLeft from './sheets/single-1/armLeft.png' with { type: 'file' };
import single1ArmRight from './sheets/single-1/armRight.png' with { type: 'file' };
import single1Head from './sheets/single-1/head.png' with { type: 'file' };
import single1Robe from './sheets/single-1/robe.png' with { type: 'file' };
import single1Sash from './sheets/single-1/sash.png' with { type: 'file' };
import single1Torso from './sheets/single-1/torso.png' with { type: 'file' };
import tqArmLeft from './sheets/threeQuarterLeft/armLeft.png' with { type: 'file' };
import tqArmRight from './sheets/threeQuarterLeft/armRight.png' with { type: 'file' };
import tqFootLeft from './sheets/threeQuarterLeft/footLeft.png' with { type: 'file' };
import tqFootRight from './sheets/threeQuarterLeft/footRight.png' with { type: 'file' };
import tqHead from './sheets/threeQuarterLeft/head.png' with { type: 'file' };
import tqRobe from './sheets/threeQuarterLeft/robe.png' with { type: 'file' };
import tqSash from './sheets/threeQuarterLeft/sash.png' with { type: 'file' };
import tqShadow from './sheets/threeQuarterLeft/shadow.png' with { type: 'file' };
import tqTorso from './sheets/threeQuarterLeft/torso.png' with { type: 'file' };
import { puppetsOf } from '../../../cutout/puppets.ts';
import { FRAMES } from './frames.ts';
import { SKELETONS } from './skeleton.ts';

/**
 * His sheet's line, which a look draws again near what moved (L3): the
 * kept front's arm read across its outline (the median run of ink, L* < 40,
 * acceptance leg 4.6) is 7.75 px; the line is laid at 8.5 so the run read
 * across it, its soft edge and the boil's resample taken, is that, in the
 * sheet's ink.
 */
export const LINE = { width: 8.5, ink: [31, 17, 9] } as const;

/** Each cut view's paper, the median of its kept view's border ground (its rim is un-matted from it, `core/unmatte.ts`). */
export const PAPERS = {
  front: [253, 241, 218],
  threeQuarterLeft: [253, 242, 220],
  'heads-4': [254, 242, 218],
  'single-1': [254, 242, 219],
} as const satisfies Readonly<Record<keyof typeof SKELETONS, readonly [number, number, number]>>;

/** Each cut view's puppet, by the view's name in his sheets' views: its parts front to back, its part sheet the kept box padded (`frames.ts`), his origin at the kept box's top-left corner, held to the kept box (`library/cutout/puppets.ts`). */
export const PUPPETS = puppetsOf({
  cast: 'lead-feast',
  frames: FRAMES,
  skeletons: SKELETONS,
  papers: PAPERS,
  line: LINE,
  parts: {
    front: [
      ['armRight', frontArmRight],
      ['armLeft', frontArmLeft],
      ['head', frontHead],
      ['sash', frontSash],
      ['footRight', frontFootRight],
      ['footLeft', frontFootLeft],
      ['shadow', frontShadow],
      ['robe', frontRobe],
      ['torso', frontTorso],
    ],
    threeQuarterLeft: [
      ['armRight', tqArmRight],
      ['armLeft', tqArmLeft],
      ['head', tqHead],
      ['sash', tqSash],
      ['footRight', tqFootRight],
      ['footLeft', tqFootLeft],
      ['shadow', tqShadow],
      ['robe', tqRobe],
      ['torso', tqTorso],
    ],
    'heads-4': [
      ['head', heads4Head],
      ['torso', heads4Torso],
    ],
    'single-1': [
      ['armRight', single1ArmRight],
      ['armLeft', single1ArmLeft],
      ['head', single1Head],
      ['sash', single1Sash],
      ['robe', single1Robe],
      ['torso', single1Torso],
    ],
  },
});
