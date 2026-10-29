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
import plArmLeft from './sheets/profileLeft/armLeft.png' with { type: 'file' };
import plHead from './sheets/profileLeft/head.png' with { type: 'file' };
import plRobe from './sheets/profileLeft/robe.png' with { type: 'file' };
import plTorso from './sheets/profileLeft/torso.png' with { type: 'file' };
import p1ArmLeft from './sheets/poses-1/armLeft.png' with { type: 'file' };
import p1ArmRight from './sheets/poses-1/armRight.png' with { type: 'file' };
import p1Baby from './sheets/poses-1/baby.png' with { type: 'file' };
import p1Cup from './sheets/poses-1/cup.png' with { type: 'file' };
import p1Head from './sheets/poses-1/head.png' with { type: 'file' };
import p1Robe from './sheets/poses-1/robe.png' with { type: 'file' };
import p1Torso from './sheets/poses-1/torso.png' with { type: 'file' };
import p2ArmLeft from './sheets/poses-2/armLeft.png' with { type: 'file' };
import p2ArmRight from './sheets/poses-2/armRight.png' with { type: 'file' };
import p2Baby from './sheets/poses-2/baby.png' with { type: 'file' };
import p2Head from './sheets/poses-2/head.png' with { type: 'file' };
import p2Robe from './sheets/poses-2/robe.png' with { type: 'file' };
import p2Stool from './sheets/poses-2/stool.png' with { type: 'file' };
import p2Torso from './sheets/poses-2/torso.png' with { type: 'file' };
import p3ArmLeft from './sheets/poses-3/armLeft.png' with { type: 'file' };
import p3ArmRight from './sheets/poses-3/armRight.png' with { type: 'file' };
import p3Baby from './sheets/poses-3/baby.png' with { type: 'file' };
import p3Head from './sheets/poses-3/head.png' with { type: 'file' };
import p3Robe from './sheets/poses-3/robe.png' with { type: 'file' };
import p3Torso from './sheets/poses-3/torso.png' with { type: 'file' };
import prArmRight from './sheets/profileRight/armRight.png' with { type: 'file' };
import prHead from './sheets/profileRight/head.png' with { type: 'file' };
import prRobe from './sheets/profileRight/robe.png' with { type: 'file' };
import prTorso from './sheets/profileRight/torso.png' with { type: 'file' };
import tqlArmLeft from './sheets/threeQuarterLeft/armLeft.png' with { type: 'file' };
import tqlArmRight from './sheets/threeQuarterLeft/armRight.png' with { type: 'file' };
import tqlHead from './sheets/threeQuarterLeft/head.png' with { type: 'file' };
import tqlRobe from './sheets/threeQuarterLeft/robe.png' with { type: 'file' };
import tqlTorso from './sheets/threeQuarterLeft/torso.png' with { type: 'file' };
import tqrArmLeft from './sheets/threeQuarterRight/armLeft.png' with { type: 'file' };
import tqrArmRight from './sheets/threeQuarterRight/armRight.png' with { type: 'file' };
import tqrHead from './sheets/threeQuarterRight/head.png' with { type: 'file' };
import tqrRobe from './sheets/threeQuarterRight/robe.png' with { type: 'file' };
import tqrTorso from './sheets/threeQuarterRight/torso.png' with { type: 'file' };
import { puppetsOf } from '../../../../../library/cutout/puppets.ts';
import { FRAMES } from './frames.ts';
import { SKELETONS } from './skeleton.ts';

/** Her turnaround's cut views, drawn on one sheet in one ink. */
type TurnaroundView =
  | 'front'
  | 'threeQuarterLeft'
  | 'back'
  | 'profileLeft'
  | 'profileRight'
  | 'threeQuarterRight';

/**
 * Her sheet's line, which a look draws again near what moved: the median run
 * of ink (r+g+b < 200) across her outer outline, every 10th row of her front,
 * threeQuarterLeft and back, is 9 px (quartiles 9 and 9), laid half a pixel
 * wider as the sower's and the lead's are; her ink is the turnaround's darkest
 * 1 % (11,2,0 to 13,3,1).
 */
const TURNAROUND_LINE = { width: 9.5, ink: [12, 2, 0] } as const;

/**
 * Her cream cloth, kept whole by the un-matte (`core/unmatte.ts`, `keep`):
 * the median of the veil's lining in poses-2, 254,247,230. The lining, the
 * swaddle and the cream under the stool are lighter than her paper (RGB
 * 11 to 25 from it), so with no cloth named they solve to no alpha and the
 * un-matte clears them (7678 px of poses-2, 386 of threeQuarterLeft and 191
 * of back show the film's paper through her). Named, they stay hers: 8, 58
 * and 2 px remain, those nearer the paper than this cream.
 */
const CLOTH = [[254, 247, 230]] as const;

/**
 * Each cut view's paper, the median of its kept view's border ground (its rim
 * is un-matted from it, `core/unmatte.ts`): 252,241,221 on all but
 * profileRight, whose ground is 252,242,222, the ground each view's dry-run
 * pads its part sheet with.
 */
const TURNAROUND_PAPERS = {
  front: [252, 241, 221],
  threeQuarterLeft: [252, 241, 221],
  back: [252, 241, 221],
  profileLeft: [252, 241, 221],
  profileRight: [252, 242, 222],
  threeQuarterRight: [252, 241, 221],
} as const satisfies Readonly<Record<TurnaroundView, readonly [number, number, number]>>;

/** Her turnaround's puppets, by the view's name in her sheets' views (`library/cutout/puppets.ts`). */
const TURNAROUND = puppetsOf<TurnaroundView>({
  cast: 'feast-mother',
  frames: FRAMES,
  skeletons: SKELETONS,
  papers: TURNAROUND_PAPERS,
  line: TURNAROUND_LINE,
  keep: CLOTH,
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
    profileLeft: [
      ['armLeft', plArmLeft],
      ['head', plHead],
      ['robe', plRobe],
      ['torso', plTorso],
    ],
    profileRight: [
      ['armRight', prArmRight],
      ['head', prHead],
      ['robe', prRobe],
      ['torso', prTorso],
    ],
    threeQuarterRight: [
      ['armRight', tqrArmRight],
      ['armLeft', tqrArmLeft],
      ['head', tqrHead],
      ['robe', tqrRobe],
      ['torso', tqrTorso],
    ],
  },
});

/** Her poses, each holding the baby, drawn on her poses sheet. */
type PoseView = 'poses-1' | 'poses-2' | 'poses-3';

/**
 * Her poses sheet's line: the median run of ink (r+g+b < 200) across her
 * outer outline, every 10th row of each pose, is 12 px (quartiles 12 and
 * 12-15), laid half a pixel wider as the turnaround's is; its ink is the
 * poses' darkest 1 % (19,4,0 to 21,5,0).
 */
const POSES_LINE = { width: 12.5, ink: [20, 4, 0] } as const;

/** Each pose's paper, the median of its kept view's border ground (its rim is un-matted from it, `core/unmatte.ts`). */
const POSES_PAPERS = {
  'poses-1': [253, 240, 215],
  'poses-2': [253, 239, 215],
  'poses-3': [253, 240, 215],
} as const satisfies Readonly<Record<PoseView, readonly [number, number, number]>>;

/** Her poses' puppets: the baby, the cup and the stool are parts of their own behind her hands. */
const POSES = puppetsOf<PoseView>({
  cast: 'feast-mother',
  frames: FRAMES,
  skeletons: SKELETONS,
  papers: POSES_PAPERS,
  line: POSES_LINE,
  keep: CLOTH,
  parts: {
    'poses-1': [
      ['armRight', p1ArmRight],
      ['armLeft', p1ArmLeft],
      ['cup', p1Cup],
      ['baby', p1Baby],
      ['head', p1Head],
      ['robe', p1Robe],
      ['torso', p1Torso],
    ],
    'poses-2': [
      ['armRight', p2ArmRight],
      ['armLeft', p2ArmLeft],
      ['baby', p2Baby],
      ['head', p2Head],
      ['stool', p2Stool],
      ['robe', p2Robe],
      ['torso', p2Torso],
    ],
    'poses-3': [
      ['armRight', p3ArmRight],
      ['armLeft', p3ArmLeft],
      ['baby', p3Baby],
      ['head', p3Head],
      ['robe', p3Robe],
      ['torso', p3Torso],
    ],
  },
});

/** Each cut view's puppet, by the view's name in her sheets' views: its parts front to back, its part sheet the kept box padded (`frames.ts`), her origin at the kept box's top-left corner, held to the kept box. */
export const PUPPETS = { ...TURNAROUND, ...POSES };
