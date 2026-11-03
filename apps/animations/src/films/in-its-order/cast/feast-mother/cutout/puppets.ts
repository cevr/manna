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
import { CUTS } from './cut.ts';
import { FRAMES } from './frames.ts';
import { POSES_PAPERS, type PoseView, TURNAROUND_PAPERS, type TurnaroundView } from './papers.ts';
import { SKELETONS } from './skeleton.ts';

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
 * of back show the film's paper through her). Named, they stay hers.
 *
 * The second colour, 255,249,211, is the yellower cream of her veil's edge in
 * the turnarounds (the cleared px there lie +2,+4,-5 RGB from the paper; this
 * is twice that step), so its half-way line to the paper keeps the farther
 * half of them and no paper pocket's px. A colour nearer the paper (the
 * cleared median itself) keeps them all but fills 8 to 88 px of real paper
 * pockets in five views, so the px nearer the paper than either colour
 * remain cleared.
 */
const CLOTH = [
  [254, 247, 230],
  [255, 249, 211],
] as const;

/**
 * Her paper's grain, luma (`core/unmatte.ts`, `grain`): the 95th percentile of
 * how far her kept ground runs darker than its paper, sampled on two views,
 * poses-1 (2.043) and turnaround-front (0.886). Other views differ
 * (profileRight 2.516); the larger of the two sampled is one calibration that
 * both her puppet members, turnaround and poses, share. A rim pixel
 * of hers darker than the paper by more than this is no paper, so the
 * un-matte keeps it whole: the grey-cream cloth of her veil, swaddle and the
 * bench leg in the poses, which the line to her ink barely reaches and would
 * otherwise solve to a few alpha, leaving holes the film's paper shows
 * through.
 */
const GRAIN = 2.04;

/** Her turnaround's puppets, by the view's name in her sheets' views (`library/cutout/puppets.ts`). */
const TURNAROUND = puppetsOf<TurnaroundView>({
  cast: 'feast-mother',
  cuts: CUTS,
  frames: FRAMES,
  skeletons: SKELETONS,
  papers: TURNAROUND_PAPERS,
  line: TURNAROUND_LINE,
  keep: CLOTH,
  grain: GRAIN,
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

/**
 * Her poses sheet's line: the median run of ink (r+g+b < 200) across her
 * outer outline, every 10th row of each pose, is 12 px (quartiles 12 and
 * 12-15), laid half a pixel wider as the turnaround's is; its ink is the
 * poses' darkest 1 % (19,4,0 to 21,5,0).
 */
const POSES_LINE = { width: 12.5, ink: [20, 4, 0] } as const;

/** Her poses' puppets: the baby, the cup and the stool are parts of their own behind her hands. */
const POSES = puppetsOf<PoseView>({
  cast: 'feast-mother',
  cuts: CUTS,
  frames: FRAMES,
  skeletons: SKELETONS,
  papers: POSES_PAPERS,
  line: POSES_LINE,
  keep: CLOTH,
  underlap: { head: 12 },
  grain: GRAIN,
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
