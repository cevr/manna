// The series lead's puppets, one a cut view (`canvas/puppet.ts`): each
// view's part sheet (`sheets/<view>/`, made by `film concept parts`), its
// parts front to back as the sheet's record lists them, each PNG imported
// by its module so a scene that draws him is keyed by its bytes
// (`tools/stamp.ts`), on the view's skeleton (`skeleton.ts`), with his origin
// at the sheet's top-left corner: his pixels are the sheet's, drawn at its
// one scale. Each declares the kept view it is held to (`concept`). Pure.

import type { PuppetSpec } from '@manna/film/canvas';
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
import tqArmLeft from './sheets/threeQuarterLeft/armLeft.png' with { type: 'file' };
import tqArmRight from './sheets/threeQuarterLeft/armRight.png' with { type: 'file' };
import tqFootLeft from './sheets/threeQuarterLeft/footLeft.png' with { type: 'file' };
import tqFootRight from './sheets/threeQuarterLeft/footRight.png' with { type: 'file' };
import tqHead from './sheets/threeQuarterLeft/head.png' with { type: 'file' };
import tqRobe from './sheets/threeQuarterLeft/robe.png' with { type: 'file' };
import tqSash from './sheets/threeQuarterLeft/sash.png' with { type: 'file' };
import tqShadow from './sheets/threeQuarterLeft/shadow.png' with { type: 'file' };
import tqTorso from './sheets/threeQuarterLeft/torso.png' with { type: 'file' };
import { SKELETONS } from './skeleton.ts';

type Box = readonly [number, number, number, number];

/** A puppet of his on `sheet`'s view held to its kept `box`, its parts front to back. */
const puppet = (
  view: keyof typeof SKELETONS,
  sheet: 'turnaround' | 'heads',
  box: Box,
  parts: ReadonlyArray<readonly [string, string]>,
): PuppetSpec => ({
  key: `lead-feast/cutout/${view}`,
  size: [box[2] - box[0], box[3] - box[1]],
  parts: parts.map(([name, png]) => ({ name, png })),
  skeleton: SKELETONS[view],
  origin: [0, 0],
  concept: { image: { cast: 'lead-feast', sheet }, box },
});

/** Each cut view's kept box on its sheet (`cast-sheet.json`). */
export const BOXES = {
  front: [18, 194, 265, 857],
  threeQuarterLeft: [292, 194, 511, 857],
  'heads-4': [774, 314, 1014, 650],
} as const satisfies Readonly<Record<keyof typeof SKELETONS, Box>>;

/** Each cut view's puppet, by the view's name in his sheets' views. */
export const PUPPETS = {
  front: puppet('front', 'turnaround', BOXES.front, [
    ['armRight', frontArmRight],
    ['armLeft', frontArmLeft],
    ['head', frontHead],
    ['sash', frontSash],
    ['footRight', frontFootRight],
    ['footLeft', frontFootLeft],
    ['shadow', frontShadow],
    ['robe', frontRobe],
    ['torso', frontTorso],
  ]),
  threeQuarterLeft: puppet('threeQuarterLeft', 'turnaround', BOXES.threeQuarterLeft, [
    ['armRight', tqArmRight],
    ['armLeft', tqArmLeft],
    ['head', tqHead],
    ['sash', tqSash],
    ['footRight', tqFootRight],
    ['footLeft', tqFootLeft],
    ['shadow', tqShadow],
    ['robe', tqRobe],
    ['torso', tqTorso],
  ]),
  'heads-4': puppet('heads-4', 'heads', BOXES['heads-4'], [
    ['head', heads4Head],
    ['torso', heads4Torso],
  ]),
} as const satisfies Readonly<Record<keyof typeof SKELETONS, PuppetSpec>>;
