// The sower's kept views cut into parts (`cutParts`, @manna/film's part sheet):
// each part his own pixels, front to back, so that a part can move while every
// pixel at rest stays the sheet's. Parts are named from his own side:
// `armRight` is his right arm, on the viewer's left from in front. He has no
// rig, so no part labels: each round hand is a disc round its whole ink ring,
// so no piece of it stays behind when the arm moves. The cuts the sheet does
// not ink (each sleeve's inner edge, a soft crease; the hem; each sandal) are
// polygons read off crops of the view. A sleeve takes its cap (a disc round
// its shoulder) above its shoulder, the rest of the shoulder the torso's. His
// head is the rows above his chin. Below the hem the sandals, each its top on
// the hem's lowest row and its foot at its sole's ink, and the ground shadow
// behind them is a part of its own. The robe is everything below his belt but
// the seed bag, which hangs from his body and leans with the torso. Each view
// names the parts a pose moves, and the words okra repaints what they hide by
// (`HIDDEN`, read by `film concept parts`, which writes `sheets/<view>/`). The
// lines are read in the kept view's pixels; the shared cut table
// (`library/cutout/table.ts`) lays them in each view's part sheet frame, its
// kept box padded (`frames.ts`). Data: the rules and the table are the shared
// module's.

import type { HiddenEntry, PartCut } from '@manna/film/tools';
import { CUT_AWAY, SHADE, grain, sides } from '../../../cutout/prompts.ts';
import {
  FAR,
  type Hem,
  type Sleeve,
  type SoleRuns,
  belowHem,
  box,
  sleeve,
  underSole,
} from '../../../cutout/rules.ts';
import { cutTable } from '../../../cutout/table.ts';
import { FRAMES } from './frames.ts';
import { JOINTS } from './joints.ts';

export { FRAMES, JOINTS };

/** A view of his, by its name in his sheets' views. */
type CutView = keyof typeof FRAMES;

/** From in front: the hem's line, lowest between his feet. */
const FRONT_HEM: Hem = [518, 126, 6, 90];
const FRONT_RIGHT: Sleeve = {
  // his right sleeve (the viewer's left): its inner edge, a linen-to-olive crease the sheet paints without ink
  inner: [
    [56, 186],
    [56, 250],
    [54.5, 280],
    [53.5, 310],
    [52.5, 330],
    [51, 346],
  ],
  shoulder: JOINTS.front.shoulderRight,
  cap: 14,
  side: 'left',
};
const FRONT_LEFT: Sleeve = {
  // his left sleeve (the viewer's right): its inner edge
  inner: [
    [199, 186],
    [199, 210],
    [200, 240],
    [201, 270],
    [202, 300],
    [203, 315],
    [206, 330],
    [208, 346],
  ],
  shoulder: JOINTS.front.shoulderLeft,
  cap: 14,
  side: 'right',
};
const frontRight = sleeve(FRONT_RIGHT);
const frontLeft = sleeve(FRONT_LEFT);
const FRONT_SOLES = {
  right: [
    [36, 36, 545],
    [37, 37, 546],
    [38, 39, 547],
    [40, 91, 548],
    [92, 101, 547],
    [102, 103, 546],
    [104, 104, 545],
    [105, 105, 544],
    [106, 106, 542],
  ],
  left: [
    [146, 146, 539],
    [147, 147, 544],
    [148, 148, 545],
    [149, 150, 546],
    [151, 161, 547],
    [162, 213, 548],
    [214, 215, 547],
    [216, 216, 546],
    [217, 217, 544],
  ],
} as const satisfies Readonly<Record<string, SoleRuns>>;

const FRONT: PartCut = {
  parts: [
    {
      name: 'armRight',
      take: [...frontRight.take, { disc: { c: [32, 366], r: 27 } }],
      unless: frontRight.unless,
      pivot: JOINTS.front.shoulderRight,
    },
    {
      name: 'armLeft',
      take: [...frontLeft.take, { disc: { c: [228.5, 369], r: 24.5 } }],
      unless: frontLeft.unless,
      pivot: JOINTS.front.shoulderLeft,
    },
    // above the chin
    { name: 'head', take: [box(-1, -1, FAR, 186)] },
    {
      // its top under the hem's lowest row, column by column
      name: 'footRight',
      take: [
        {
          polygon: [
            [30, 512],
            [53, 519],
            [53, 527],
            [78, 538],
            [78, 549],
            [82, 549],
            [82, 524],
            [96, 524],
            [96, 525],
            [112, 525],
            [112, 570],
            [30, 570],
          ],
        },
      ],
      unless: [underSole(FRONT_SOLES.right)],
    },
    {
      name: 'footLeft',
      take: [
        {
          polygon: [
            [140, 525],
            [173, 525],
            [173, 549],
            [178, 549],
            [178, 538],
            [200, 528],
            [200, 518],
            [218, 511],
            [222, 511],
            [222, 570],
            [140, 570],
          ],
        },
      ],
      unless: [underSole(FRONT_SOLES.left)],
    },
    { name: 'shadow', take: [belowHem(...FRONT_HEM)] },
    // below the belt, but the seed bag
    { name: 'robe', take: [box(-1, 331, FAR, FAR * 2)], unless: [box(157, 309, 206, 413)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR * 2)] },
  ],
};

/** His outline's ink, the house's warm dark brown. */
const INK = [42, 30, 24, 255] as const;

/** Where his body's sides run under his arms: out to his shoulders and robe, not in at the sleeves' inner edges. */
const SIDES = sides({ lower: 'robe', cloth: 'the linen tunic and olive mantle' });

/** The paper grain his sheet shows on his body, carried into the paint under his arms. */
const GRAIN = grain('the linen tunic and olive mantle of his body');

/**
 * Each view's moving parts (what a pose moves, whose areas are painted
 * magenta and repainted beneath), and the words okra repaints them by: what
 * lies under them, in the sheet's own style.
 */
const HIDDEN_ENTRIES = {
  front: {
    moving: ['armRight', 'armLeft'],
    prompt: `${CUT_AWAY} his two arms (sleeves and round hands) were cut away to make a cut-out puppet. Repaint ONLY the magenta areas, as what lies underneath his arms: the sides of his body, from each armpit down to the robe, each side closed by the same thick dark brown-black outline as the rest of him, painted in exactly the same style, colours and soft shading as his body beside each arm (the linen tunic, the olive mantle with its walnut-brown edge band, the belt round his waist). ${SIDES} ${SHADE} ${GRAIN} There are no arms now: no sleeves, no hands, nothing magenta left. Where the magenta lay outside his body, it becomes the plain cream paper. Keep every other pixel exactly as it is: the same head, headcloth, face, beard, tunic, mantle, walnut strap, belt, walnut seed bag, feet, size, position and framing.`,
  },
} as const satisfies Readonly<Record<CutView, HiddenEntry>>;

/** His cut table: each view's cut and how its figure is read. */
export const { CUTS, cutOptionsFor, HIDDEN } = cutTable({
  frames: FRAMES,
  views: {
    front: { cut: FRONT, figure: 'framed' },
  },
  hidden: HIDDEN_ENTRIES,
  ink: INK,
});
