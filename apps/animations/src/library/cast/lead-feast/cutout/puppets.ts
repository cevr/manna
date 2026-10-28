// The series lead's puppets, one a cut view (`canvas/puppet.ts`): each
// view's part sheet (`sheets/<view>/`, made by `film concept parts`), its
// parts front to back as the sheet's record lists them, each PNG imported
// by its module so a scene that draws him is keyed by its bytes
// (`tools/stamp.ts`), on the view's skeleton (`skeleton.ts`), with his origin
// at the kept box's top-left corner in the padded part sheet (`frames.ts`):
// his pixels are the sheet's, drawn at its
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
import { FRAMES, type FramedView, boxOf, keptAt } from './frames.ts';
import { SKELETONS } from './skeleton.ts';

type Box = readonly [number, number, number, number];

/** A puppet of his on his view `view`, its parts front to back: its part sheet the kept box padded (`frames.ts`), his origin at the kept box's top-left corner, held to the kept box. */
const puppet = (view: FramedView, parts: ReadonlyArray<readonly [string, string]>): PuppetSpec => {
  const frame = boxOf(view);
  return {
    key: `lead-feast/cutout/${view}`,
    size: [frame[2] - frame[0], frame[3] - frame[1]],
    parts: parts.map(([name, png]) => ({ name, png })),
    skeleton: SKELETONS[view],
    origin: keptAt(view),
    concept: { image: { cast: 'lead-feast', sheet: FRAMES[view].sheet }, box: BOXES[view] },
    paper: PAPERS[view],
  };
};

/** Each cut view's paper, the median of its kept view's border ground (its rim is un-matted from it, `core/unmatte.ts`). */
export const PAPERS = {
  front: [253, 241, 218],
  threeQuarterLeft: [253, 242, 220],
  'heads-4': [254, 242, 218],
} as const satisfies Readonly<Record<keyof typeof SKELETONS, readonly [number, number, number]>>;

/** Each cut view's kept box on its sheet (`cast-sheet.json`, `frames.ts`). */
export const BOXES: Readonly<Record<FramedView, Box>> = {
  front: FRAMES.front.kept,
  threeQuarterLeft: FRAMES.threeQuarterLeft.kept,
  'heads-4': FRAMES['heads-4'].kept,
};

/** Each cut view's puppet, by the view's name in his sheets' views. */
export const PUPPETS = {
  front: puppet('front', [
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
  threeQuarterLeft: puppet('threeQuarterLeft', [
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
  'heads-4': puppet('heads-4', [
    ['head', heads4Head],
    ['torso', heads4Torso],
  ]),
} as const satisfies Readonly<Record<keyof typeof SKELETONS, PuppetSpec>>;
