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

const TURNAROUND_LINE = { width: 9.5, ink: [12, 2, 0] } as const;

const CLOTH = [
  [254, 247, 230],
  [255, 249, 211],
] as const;

const GRAIN = 2.04;

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

const POSES_LINE = { width: 12.5, ink: [20, 4, 0] } as const;

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

export const PUPPETS = { ...TURNAROUND, ...POSES };
