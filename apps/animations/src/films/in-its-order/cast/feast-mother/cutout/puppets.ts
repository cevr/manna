// The feast mother's puppets, one a cut view (`canvas/puppet.ts`): each
// view's part sheet (`sheets/<view>/`, made by `film concept parts`), its
// parts front to back as the sheet's record lists them, each PNG imported by
// its module so a scene that draws her is keyed by its bytes
// (`tools/stamp.ts`), on the view's skeleton (`skeleton.ts`), with her origin
// at the kept box's top-left corner in the padded part sheet (`frames.ts`):
// her pixels are the sheet's, drawn at its one scale. She is a film's member,
// so her folder is In Its Order's (`films/in-its-order/cast/feast-mother/`).
// Pure data.

import backArmLeft from './sheets/back/armLeft.png' with { type: 'file' };
import backArmRight from './sheets/back/armRight.png' with { type: 'file' };
import backHead from './sheets/back/head.png' with { type: 'file' };
import backRobe from './sheets/back/robe.png' with { type: 'file' };
import backTorso from './sheets/back/torso.png' with { type: 'file' };
import frontArmLeft from './sheets/front/armLeft.png' with { type: 'file' };
import frontArmRight from './sheets/front/armRight.png' with { type: 'file' };
import frontHead from './sheets/front/head.png' with { type: 'file' };
import frontRobe from './sheets/front/robe.png' with { type: 'file' };
import frontTorso from './sheets/front/torso.png' with { type: 'file' };
import tqlArmLeft from './sheets/threeQuarterLeft/armLeft.png' with { type: 'file' };
import tqlArmRight from './sheets/threeQuarterLeft/armRight.png' with { type: 'file' };
import tqlHead from './sheets/threeQuarterLeft/head.png' with { type: 'file' };
import tqlRobe from './sheets/threeQuarterLeft/robe.png' with { type: 'file' };
import tqlTorso from './sheets/threeQuarterLeft/torso.png' with { type: 'file' };
import { puppetsOf } from '../../../../../library/cutout/puppets.ts';
import { FRAMES } from './frames.ts';
import { SKELETONS } from './skeleton.ts';

/** Her turnaround's cut views, drawn on one sheet in one ink. */
type TurnaroundView = 'front' | 'threeQuarterLeft' | 'back';

/**
 * Her sheet's line, which a look draws again near what moved: the median run
 * of ink (r+g+b < 200) across her outer outline, every 10th row of her front,
 * threeQuarterLeft and back, is 9 px (quartiles 9 and 9), laid half a pixel
 * wider as the sower's and the lead's are; her ink is the turnaround's darkest
 * 1 % (11,2,0 to 13,3,1).
 */
const TURNAROUND_LINE = { width: 9.5, ink: [12, 2, 0] } as const;

/**
 * Each cut view's paper, the median of its kept view's border ground (its rim
 * is un-matted from it, `core/unmatte.ts`): 252,241,221 on all three, the
 * ground each view's dry-run pads its part sheet with.
 */
const TURNAROUND_PAPERS = {
  front: [252, 241, 221],
  threeQuarterLeft: [252, 241, 221],
  back: [252, 241, 221],
} as const satisfies Readonly<Record<TurnaroundView, readonly [number, number, number]>>;

/** Her turnaround's puppets, by the view's name in her sheets' views (`library/cutout/puppets.ts`). */
const TURNAROUND = puppetsOf<TurnaroundView>({
  cast: 'feast-mother',
  frames: FRAMES,
  skeletons: SKELETONS,
  papers: TURNAROUND_PAPERS,
  line: TURNAROUND_LINE,
  parts: {
    front: [
      ['armRight', frontArmRight],
      ['armLeft', frontArmLeft],
      ['head', frontHead],
      ['robe', frontRobe],
      ['torso', frontTorso],
    ],
    threeQuarterLeft: [
      ['armRight', tqlArmRight],
      ['armLeft', tqlArmLeft],
      ['head', tqlHead],
      ['robe', tqlRobe],
      ['torso', tqlTorso],
    ],
    back: [
      ['armRight', backArmRight],
      ['armLeft', backArmLeft],
      ['head', backHead],
      ['robe', backRobe],
      ['torso', backTorso],
    ],
  },
});

/** Each cut view's puppet, by the view's name in her sheets' views: its parts front to back, its part sheet the kept box padded (`frames.ts`), her origin at the kept box's top-left corner, held to the kept box. */
export const PUPPETS = { ...TURNAROUND };
