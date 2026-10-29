// The sower's puppets, one a cut view (`canvas/puppet.ts`): each view's part
// sheet (`sheets/<view>/`, made by `film concept parts`), its parts front to
// back as the sheet's record lists them, each PNG imported by its module so
// a scene that draws him is keyed by its bytes (`tools/stamp.ts`), on the
// view's skeleton (`skeleton.ts`), with his origin at the kept box's top-left
// corner in the padded part sheet (`frames.ts`): his pixels are the sheet's,
// drawn at its one scale. His turnaround and his poses are two sheets drawn
// in two inks, so each sheet's views take its own line. Pure data.

import backArmLeft from './sheets/back/armLeft.png' with { type: 'file' };
import backArmRight from './sheets/back/armRight.png' with { type: 'file' };
import backFootLeft from './sheets/back/footLeft.png' with { type: 'file' };
import backFootRight from './sheets/back/footRight.png' with { type: 'file' };
import backHead from './sheets/back/head.png' with { type: 'file' };
import backRobe from './sheets/back/robe.png' with { type: 'file' };
import backShadow from './sheets/back/shadow.png' with { type: 'file' };
import backTorso from './sheets/back/torso.png' with { type: 'file' };
import frontArmLeft from './sheets/front/armLeft.png' with { type: 'file' };
import frontArmRight from './sheets/front/armRight.png' with { type: 'file' };
import frontFootLeft from './sheets/front/footLeft.png' with { type: 'file' };
import frontFootRight from './sheets/front/footRight.png' with { type: 'file' };
import frontHead from './sheets/front/head.png' with { type: 'file' };
import frontRobe from './sheets/front/robe.png' with { type: 'file' };
import frontShadow from './sheets/front/shadow.png' with { type: 'file' };
import frontTorso from './sheets/front/torso.png' with { type: 'file' };
import p1ArmLeft from './sheets/poses-1/armLeft.png' with { type: 'file' };
import p1ArmRight from './sheets/poses-1/armRight.png' with { type: 'file' };
import p1FootLeft from './sheets/poses-1/footLeft.png' with { type: 'file' };
import p1FootRight from './sheets/poses-1/footRight.png' with { type: 'file' };
import p1Head from './sheets/poses-1/head.png' with { type: 'file' };
import p1Robe from './sheets/poses-1/robe.png' with { type: 'file' };
import p1Seed from './sheets/poses-1/seed.png' with { type: 'file' };
import p1Shadow from './sheets/poses-1/shadow.png' with { type: 'file' };
import p1Torso from './sheets/poses-1/torso.png' with { type: 'file' };
import p2ArmLeft from './sheets/poses-2/armLeft.png' with { type: 'file' };
import p2ArmRight from './sheets/poses-2/armRight.png' with { type: 'file' };
import p2FootLeft from './sheets/poses-2/footLeft.png' with { type: 'file' };
import p2FootRight from './sheets/poses-2/footRight.png' with { type: 'file' };
import p2Head from './sheets/poses-2/head.png' with { type: 'file' };
import p2Robe from './sheets/poses-2/robe.png' with { type: 'file' };
import p2Shadow from './sheets/poses-2/shadow.png' with { type: 'file' };
import p2Torso from './sheets/poses-2/torso.png' with { type: 'file' };
import p3ArmLeft from './sheets/poses-3/armLeft.png' with { type: 'file' };
import p3ArmRight from './sheets/poses-3/armRight.png' with { type: 'file' };
import p3FootLeft from './sheets/poses-3/footLeft.png' with { type: 'file' };
import p3FootRight from './sheets/poses-3/footRight.png' with { type: 'file' };
import p3Head from './sheets/poses-3/head.png' with { type: 'file' };
import p3Robe from './sheets/poses-3/robe.png' with { type: 'file' };
import p3Shadow from './sheets/poses-3/shadow.png' with { type: 'file' };
import p3Torso from './sheets/poses-3/torso.png' with { type: 'file' };
import p4ArmLeft from './sheets/poses-4/armLeft.png' with { type: 'file' };
import p4ArmRight from './sheets/poses-4/armRight.png' with { type: 'file' };
import p4FootLeft from './sheets/poses-4/footLeft.png' with { type: 'file' };
import p4FootRight from './sheets/poses-4/footRight.png' with { type: 'file' };
import p4Head from './sheets/poses-4/head.png' with { type: 'file' };
import p4Robe from './sheets/poses-4/robe.png' with { type: 'file' };
import p4Shadow from './sheets/poses-4/shadow.png' with { type: 'file' };
import p4Torso from './sheets/poses-4/torso.png' with { type: 'file' };
import plArmLeft from './sheets/profileLeft/armLeft.png' with { type: 'file' };
import plFootLeft from './sheets/profileLeft/footLeft.png' with { type: 'file' };
import plFootRight from './sheets/profileLeft/footRight.png' with { type: 'file' };
import plHead from './sheets/profileLeft/head.png' with { type: 'file' };
import plRobe from './sheets/profileLeft/robe.png' with { type: 'file' };
import plShadow from './sheets/profileLeft/shadow.png' with { type: 'file' };
import plTorso from './sheets/profileLeft/torso.png' with { type: 'file' };
import prArmRight from './sheets/profileRight/armRight.png' with { type: 'file' };
import prFootLeft from './sheets/profileRight/footLeft.png' with { type: 'file' };
import prFootRight from './sheets/profileRight/footRight.png' with { type: 'file' };
import prHead from './sheets/profileRight/head.png' with { type: 'file' };
import prRobe from './sheets/profileRight/robe.png' with { type: 'file' };
import prShadow from './sheets/profileRight/shadow.png' with { type: 'file' };
import prTorso from './sheets/profileRight/torso.png' with { type: 'file' };
import tqlArmLeft from './sheets/threeQuarterLeft/armLeft.png' with { type: 'file' };
import tqlArmRight from './sheets/threeQuarterLeft/armRight.png' with { type: 'file' };
import tqlFootLeft from './sheets/threeQuarterLeft/footLeft.png' with { type: 'file' };
import tqlFootRight from './sheets/threeQuarterLeft/footRight.png' with { type: 'file' };
import tqlHead from './sheets/threeQuarterLeft/head.png' with { type: 'file' };
import tqlRobe from './sheets/threeQuarterLeft/robe.png' with { type: 'file' };
import tqlShadow from './sheets/threeQuarterLeft/shadow.png' with { type: 'file' };
import tqlTorso from './sheets/threeQuarterLeft/torso.png' with { type: 'file' };
import tqrArmLeft from './sheets/threeQuarterRight/armLeft.png' with { type: 'file' };
import tqrArmRight from './sheets/threeQuarterRight/armRight.png' with { type: 'file' };
import tqrFootLeft from './sheets/threeQuarterRight/footLeft.png' with { type: 'file' };
import tqrFootRight from './sheets/threeQuarterRight/footRight.png' with { type: 'file' };
import tqrHead from './sheets/threeQuarterRight/head.png' with { type: 'file' };
import tqrRobe from './sheets/threeQuarterRight/robe.png' with { type: 'file' };
import tqrShadow from './sheets/threeQuarterRight/shadow.png' with { type: 'file' };
import tqrTorso from './sheets/threeQuarterRight/torso.png' with { type: 'file' };
import { puppetsOf } from '../../../cutout/puppets.ts';
import { FRAMES } from './frames.ts';
import { SKELETONS } from './skeleton.ts';

/** His turnaround's views, drawn on one sheet in one ink. */
type TurnaroundView =
  | 'front'
  | 'threeQuarterLeft'
  | 'back'
  | 'profileLeft'
  | 'profileRight'
  | 'threeQuarterRight';

/** His poses' views, drawn on one sheet in one ink. */
type PosesView = 'poses-1' | 'poses-2' | 'poses-3' | 'poses-4';

/**
 * Each sheet's line, which a look draws again near what moved: the median run
 * of ink (L* < 40) across his outline on every one of his ten kept views is
 * 9 px, read the way that reads 8 px on the lead's front (laid at 8.5), so his
 * line is laid at 9.5; each sheet's ink is its own, the turnaround's darker.
 */
const TURNAROUND_LINE = { width: 9.5, ink: [35, 17, 8] } as const;
const POSES_LINE = { width: 9.5, ink: [48, 30, 15] } as const;

/**
 * Each cut view's paper, the median of its kept view's border ground (its rim
 * is un-matted from it, `core/unmatte.ts`). The left profile's sheet glows
 * lighter beside his outline (251,243,228 outside his ink) than at its border,
 * and that glow, nearer his linen than the border's paper, stayed on as thin
 * paper strips; its paper is the glow, so the rim clears it.
 */
const TURNAROUND_PAPERS = {
  front: [250, 237, 217],
  threeQuarterLeft: [250, 236, 216],
  back: [249, 236, 216],
  profileLeft: [252, 245, 230],
  profileRight: [250, 237, 217],
  threeQuarterRight: [250, 236, 216],
} as const satisfies Readonly<Record<TurnaroundView, readonly [number, number, number]>>;
const POSES_PAPERS = {
  'poses-1': [249, 234, 213],
  'poses-2': [249, 233, 211],
  'poses-3': [249, 234, 212],
  'poses-4': [249, 234, 212],
} as const satisfies Readonly<Record<PosesView, readonly [number, number, number]>>;

/**
 * His linen's lit rim, lighter than his papers, so the un-matte's line from
 * the paper to his ink does not reach it: kept as his, not cleared as paper
 * (`core/unmatte.ts`, `keep`). Read from the kept crops' tunic beside his
 * outline on the front and back.
 */
const LINEN = [
  [253, 243, 220],
  [253, 238, 210],
  [247, 240, 226],
  [252, 249, 228],
] as const satisfies ReadonlyArray<readonly [number, number, number]>;

/** His seed: specks thinner than the un-matte's band, which keep their ochre on another paper (`core/unmatte.ts`, `thin`). */
const THIN = ['seed'] as const;

/** His turnaround's puppets, by the view's name in his sheets' views (`library/cutout/puppets.ts`). */
const TURNAROUND = puppetsOf<TurnaroundView>({
  cast: 'sower',
  frames: FRAMES,
  skeletons: SKELETONS,
  papers: TURNAROUND_PAPERS,
  keep: LINEN,
  thin: THIN,
  line: TURNAROUND_LINE,
  parts: {
    front: [
      ['armRight', frontArmRight],
      ['armLeft', frontArmLeft],
      ['head', frontHead],
      ['footRight', frontFootRight],
      ['footLeft', frontFootLeft],
      ['shadow', frontShadow],
      ['robe', frontRobe],
      ['torso', frontTorso],
    ],
    threeQuarterLeft: [
      ['armRight', tqlArmRight],
      ['head', tqlHead],
      ['armLeft', tqlArmLeft],
      ['footRight', tqlFootRight],
      ['footLeft', tqlFootLeft],
      ['shadow', tqlShadow],
      ['robe', tqlRobe],
      ['torso', tqlTorso],
    ],
    back: [
      ['head', backHead],
      ['armRight', backArmRight],
      ['armLeft', backArmLeft],
      ['footRight', backFootRight],
      ['footLeft', backFootLeft],
      ['shadow', backShadow],
      ['robe', backRobe],
      ['torso', backTorso],
    ],
    profileLeft: [
      ['armLeft', plArmLeft],
      ['head', plHead],
      ['footLeft', plFootLeft],
      ['footRight', plFootRight],
      ['shadow', plShadow],
      ['robe', plRobe],
      ['torso', plTorso],
    ],
    profileRight: [
      ['armRight', prArmRight],
      ['head', prHead],
      ['footRight', prFootRight],
      ['footLeft', prFootLeft],
      ['shadow', prShadow],
      ['robe', prRobe],
      ['torso', prTorso],
    ],
    threeQuarterRight: [
      ['head', tqrHead],
      ['armRight', tqrArmRight],
      ['armLeft', tqrArmLeft],
      ['footRight', tqrFootRight],
      ['footLeft', tqrFootLeft],
      ['shadow', tqrShadow],
      ['robe', tqrRobe],
      ['torso', tqrTorso],
    ],
  },
});

/** His poses' puppets, by the view's name in his sheets' views (`library/cutout/puppets.ts`). */
const POSES = puppetsOf<PosesView>({
  cast: 'sower',
  frames: FRAMES,
  skeletons: SKELETONS,
  papers: POSES_PAPERS,
  keep: LINEN,
  thin: THIN,
  line: POSES_LINE,
  parts: {
    'poses-1': [
      ['head', p1Head],
      ['armLeft', p1ArmLeft],
      ['seed', p1Seed],
      ['armRight', p1ArmRight],
      ['footRight', p1FootRight],
      ['footLeft', p1FootLeft],
      ['shadow', p1Shadow],
      ['robe', p1Robe],
      ['torso', p1Torso],
    ],
    'poses-2': [
      ['head', p2Head],
      ['armLeft', p2ArmLeft],
      ['armRight', p2ArmRight],
      ['footLeft', p2FootLeft],
      ['footRight', p2FootRight],
      ['shadow', p2Shadow],
      ['robe', p2Robe],
      ['torso', p2Torso],
    ],
    'poses-3': [
      ['head', p3Head],
      ['armLeft', p3ArmLeft],
      ['armRight', p3ArmRight],
      ['footRight', p3FootRight],
      ['footLeft', p3FootLeft],
      ['shadow', p3Shadow],
      ['robe', p3Robe],
      ['torso', p3Torso],
    ],
    'poses-4': [
      ['head', p4Head],
      ['armLeft', p4ArmLeft],
      ['armRight', p4ArmRight],
      ['footLeft', p4FootLeft],
      ['footRight', p4FootRight],
      ['shadow', p4Shadow],
      ['robe', p4Robe],
      ['torso', p4Torso],
    ],
  },
});

/** Each cut view's puppet, by the view's name in his sheets' views: its parts front to back, its part sheet the kept box padded (`frames.ts`), his origin at the kept box's top-left corner, held to the kept box. */
export const PUPPETS = { ...TURNAROUND, ...POSES };
