// The IDEA villagers' puppets, one a cut view (`canvas/puppet.ts`): each
// view's part sheet (`sheets/<view>/`, made by `film concept parts`), its
// parts front to back as the sheet's record lists them, each PNG imported by
// its module so a scene that draws them is keyed by its bytes
// (`tools/stamp.ts`), on the view's skeleton (`skeleton.ts`), with the origin
// at the kept box's top-left corner in the padded part sheet (`frames.ts`):
// their pixels are the sheet's, drawn at its one scale. They are a film's
// member, so their folder is In Its Order's
// (`films/in-its-order/cast/idea-villagers/`). Pure data.

import p3ArmLeft from './sheets/poses-3/armLeft.png' with { type: 'file' };
import p3ArmRight from './sheets/poses-3/armRight.png' with { type: 'file' };
import p3Head from './sheets/poses-3/head.png' with { type: 'file' };
import p3Robe from './sheets/poses-3/robe.png' with { type: 'file' };
import p3Torso from './sheets/poses-3/torso.png' with { type: 'file' };
import p4ArmLeft from './sheets/poses-4/armLeft.png' with { type: 'file' };
import p4ArmRight from './sheets/poses-4/armRight.png' with { type: 'file' };
import p4Head from './sheets/poses-4/head.png' with { type: 'file' };
import p4Torso from './sheets/poses-4/torso.png' with { type: 'file' };
import p6ArmLeft from './sheets/poses-6/armLeft.png' with { type: 'file' };
import p6ArmRight from './sheets/poses-6/armRight.png' with { type: 'file' };
import p6Head from './sheets/poses-6/head.png' with { type: 'file' };
import p6Robe from './sheets/poses-6/robe.png' with { type: 'file' };
import p6Torso from './sheets/poses-6/torso.png' with { type: 'file' };
import s15ArmLeft from './sheets/single-15/armLeft.png' with { type: 'file' };
import s15ArmRight from './sheets/single-15/armRight.png' with { type: 'file' };
import s15Head from './sheets/single-15/head.png' with { type: 'file' };
import s15Robe from './sheets/single-15/robe.png' with { type: 'file' };
import s15Torso from './sheets/single-15/torso.png' with { type: 'file' };
import { puppetsOf } from '../../../../../library/cutout/puppets.ts';
import { CUTS } from './cut.ts';
import { FRAMES, type FramedView } from './frames.ts';
import { SKELETONS } from './skeleton.ts';

/**
 * The hopping man's line: the median run of ink across his outer outline is
 * 10 px (quartiles 9 and 13), laid half a pixel wider as the feast mother's
 * is; his ink is his view's darkest 1 % (6,2,0).
 */
const HOPPING_LINE = { width: 10.5, ink: [6, 2, 0] } as const;

/**
 * The baby's and the standing man's line: the median run of ink across their
 * outer outlines is 8 px (quartiles 7 and 11 on the baby, 7 and 9 on the man),
 * laid half a pixel wider; their ink is each view's darkest 1 % (6,1,0 and
 * 5,1,0).
 */
const LINE = { width: 8.5, ink: [6, 1, 0] } as const;

/**
 * The cup-raising man's line (single-15, drawn about 2.2 times the poses
 * sheet's scale): the median run of ink across his outer outline (L* < 40) is
 * 18 px (quartiles 17 and 21), laid half a pixel wider; his ink is his view's
 * darkest 1 % (1,0,0). Read the same way, the standing man's is 8 px (8 and 9).
 */
const SINGLE_LINE = { width: 18.5, ink: [1, 0, 0] } as const;

/**
 * Their paper's grain, luma (`core/unmatte.ts`, `grain`): the 95th percentile
 * of how far each kept view's ground (flooded from the border, within 30 of
 * its paper) runs darker than its paper is 2.516 (poses-3), 2.484 (poses-4),
 * 2.744 (poses-6) and 2.456 (single-15); the largest, 2.75, is the one
 * calibration all four share. A rim pixel of theirs darker than the paper by more than this is no
 * paper, so the un-matte keeps it whole: at rest it keeps 5606 (poses-3),
 * 1480 (poses-4) and 4303 (poses-6) rim px whole and fills no px of a real
 * paper pocket (the kept crop's holes, which the figure closes round).
 *
 * They name no `keep` colour. Their light linen sits nearer their paper than
 * the pockets' own ground does: each linen colour tried (the headcloth's
 * 252,247,225 and 253,247,231, the sleeve's 251,245,224, and lighter steps up
 * to 255,254,246) fills 2 to 78 px of a real paper pocket in at least one
 * view, so the film's paper would show a cut-out patch there; the wrap's
 * 252,226,188 fills none but keeps 1 px whole. The linen nearer their paper
 * than the grain's line stays un-matted.
 */
const GRAIN = 2.75;

/** Each view's paper, the median of its kept view's border ground (its rim is un-matted from it, `core/unmatte.ts`). */
const PAPERS = {
  'poses-3': [253, 237, 212],
  'poses-4': [253, 236, 213],
  'poses-6': [253, 237, 213],
  'single-15': [253, 239, 216],
} as const satisfies Readonly<Record<FramedView, readonly [number, number, number]>>;

const SHARED = {
  cast: 'idea-villagers',
  cuts: CUTS,
  frames: FRAMES,
  skeletons: SKELETONS,
  papers: PAPERS,
  grain: GRAIN,
} as const;

/**
 * The hopping man's puppet. His sheet's `neighbour` part is left out: it holds
 * the baby's head (poses-4), which reaches into his kept box, so that no
 * figure pixel of the box is left in no part (`cut.ts`). It is the baby's,
 * drawn by the baby's own puppet, never his.
 */
const HOPPING = puppetsOf<'poses-3'>({
  ...SHARED,
  line: HOPPING_LINE,
  parts: {
    'poses-3': [
      ['armLeft', p3ArmLeft],
      ['armRight', p3ArmRight],
      ['head', p3Head],
      ['robe', p3Robe],
      ['torso', p3Torso],
    ],
  },
});

/** The baby's and the standing man's puppets. */
const POSES = puppetsOf<'poses-4' | 'poses-6'>({
  ...SHARED,
  line: LINE,
  parts: {
    'poses-4': [
      ['armRight', p4ArmRight],
      ['armLeft', p4ArmLeft],
      ['head', p4Head],
      ['torso', p4Torso],
    ],
    'poses-6': [
      ['armRight', p6ArmRight],
      ['armLeft', p6ArmLeft],
      ['head', p6Head],
      ['robe', p6Robe],
      ['torso', p6Torso],
    ],
  },
});

/** The cup-raising man's puppet (single-15), drawn larger than the poses sheet's figures. */
const SINGLE = puppetsOf<'single-15'>({
  ...SHARED,
  line: SINGLE_LINE,
  parts: {
    'single-15': [
      ['armRight', s15ArmRight],
      ['armLeft', s15ArmLeft],
      ['head', s15Head],
      ['robe', s15Robe],
      ['torso', s15Torso],
    ],
  },
});

/** Each cut view's puppet, by the view's name in their sheet's views: its parts front to back, its part sheet the kept box padded (`frames.ts`), the origin at the kept box's top-left corner, held to the kept box. */
export const PUPPETS = { ...HOPPING, ...POSES, ...SINGLE };
