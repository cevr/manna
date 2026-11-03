import type { PuppetSpec } from '@manna/film/canvas';
import raiseSeatedK2 from './raise-seated/keys/k2.png' with { type: 'file' };
import raiseSeatedK3 from './raise-seated/keys/k3.png' with { type: 'file' };
import raiseSeatedK4 from './raise-seated/keys/k4.png' with { type: 'file' };
import raiseSeatedK5 from './raise-seated/keys/k5.png' with { type: 'file' };
import raiseSeatedRest from './raise-seated/keys/rest.png' with { type: 'file' };
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
import single5Head from './sheets/single-5/head.png' with { type: 'file' };
import single5Torso from './sheets/single-5/torso.png' with { type: 'file' };
import single9ArmLeft from './sheets/single-9/armLeft.png' with { type: 'file' };
import single9ArmRight from './sheets/single-9/armRight.png' with { type: 'file' };
import single9Head from './sheets/single-9/head.png' with { type: 'file' };
import single9Robe from './sheets/single-9/robe.png' with { type: 'file' };
import single9Sash from './sheets/single-9/sash.png' with { type: 'file' };
import single9Torso from './sheets/single-9/torso.png' with { type: 'file' };
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
import { CUTS } from './cut.ts';
import { FRAMES } from './frames.ts';
import { SKELETONS } from './skeleton.ts';

export const LINE = { width: 8.5, ink: [31, 17, 9] } as const;

export const PAPERS = {
  front: [253, 241, 218],
  threeQuarterLeft: [253, 242, 220],
  'heads-4': [254, 242, 218],
  'single-1': [254, 242, 219],
  'single-9': [254, 243, 219],
  'single-5': [254, 243, 220],
} as const satisfies Readonly<Record<keyof typeof SKELETONS, readonly [number, number, number]>>;

export const PUPPETS = puppetsOf({
  cast: 'lead-feast',
  frames: FRAMES,
  cuts: CUTS,
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
    'single-9': [
      ['armRight', single9ArmRight],
      ['armLeft', single9ArmLeft],
      ['head', single9Head],
      ['sash', single9Sash],
      ['robe', single9Robe],
      ['torso', single9Torso],
    ],
    'single-5': [
      ['head', single5Head],
      ['torso', single5Torso],
    ],
  },
});

export const DRAWINGS = {
  'single-9': [
    { name: 'raise-rest', png: raiseSeatedRest, part: 'armRight' },
    { name: 'raise-k2', png: raiseSeatedK2, part: 'armRight' },
    { name: 'raise-k3', png: raiseSeatedK3, part: 'armRight' },
    { name: 'raise-k4', png: raiseSeatedK4, part: 'armRight' },
    { name: 'raise-k5', png: raiseSeatedK5, part: 'armRight' },
  ],
} as const satisfies Partial<Readonly<Record<keyof typeof SKELETONS, PuppetSpec['drawings']>>>;
