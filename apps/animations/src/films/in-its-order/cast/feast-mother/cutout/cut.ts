// The feast mother's kept views cut into parts (`cutParts`, @manna/film's part
// sheet): each part her own pixels, front to back, so that a part can move while
// every pixel at rest stays the sheet's. Parts are named from her own side:
// `armRight` is her right arm, on the viewer's left from in front and on the
// viewer's right from behind. Her white veil covers her head and both shoulders,
// so each sleeve is the pixels on its side of its inner edge below the veil's
// hem (`VEIL`, every row above it the veil's), down to her round hand's lowest
// ink; the veil itself stays with her torso. A sleeve's inner edge is a soft
// crease the sheet paints without ink, read off crops of the view. Her head is
// the rows above her chin, her robe (and the feet and ground line under it)
// every row from her hip down that the arms leave, and her torso the rest. Each
// view names the parts a pose moves, and the words okra repaints what they hide
// by (`HIDDEN`, read by `film concept parts`, which writes `sheets/<view>/`).
// The lines are read in the kept view's pixels; the shared cut table
// (`library/cutout/table.ts`) lays them in each view's part sheet frame. Data:
// the rules and the table are the library's.

import type { HiddenEntry, PartCut, PartRule } from '@manna/film/tools';
import { CUT_AWAY, grain, shade, sides } from '../../../../../library/cutout/prompts.ts';
import { FAR, type Sleeve, box, sleeve } from '../../../../../library/cutout/rules.ts';
import { cutTable } from '../../../../../library/cutout/table.ts';
import { FRAMES } from './frames.ts';
import { JOINTS } from './joints.ts';

export { FRAMES, JOINTS };

/** A view of hers, by its name in her sheets' views. */
type CutView = keyof typeof FRAMES;

/** Each view's veil: every pixel above its hem, the hem's ink with it, which no sleeve takes. */
const VEIL = {
  front: {
    polygon: [
      [-1, -1],
      [FAR, -1],
      [FAR, 233],
      [212, 236],
      [201, 243],
      [184, 247],
      [33, 247],
      [16, 243],
      [6, 236],
      [-1, 233],
    ],
  },
  // her veil runs lower on her far side (the viewer's right), round the top of her left sleeve
  threeQuarterLeft: {
    polygon: [
      [-1, -1],
      [FAR, -1],
      [FAR, 240],
      [217, 244],
      [210, 255],
      [196, 265],
      [168, 265],
      [163, 248],
      [37, 248],
      [17, 243],
      [6, 236],
      [-1, 233],
    ],
  },
  // from behind it hangs lowest at her back's middle
  back: {
    polygon: [
      [-1, -1],
      [FAR, -1],
      [FAR, 240],
      [210, 246],
      [200, 256],
      [186, 266],
      [166, 274],
      [121, 276],
      [100, 276],
      [53, 266],
      [30, 259],
      [15, 256],
      [4, 246],
      [-1, 240],
    ],
  },
} as const satisfies Readonly<Record<CutView, PartRule>>;

/** Her hip's row in each view: the robe is every row below it that her arms and hands leave. */
const HIP = 330;

/** Each sleeve's inner edge, from the shoulder's row down to the bottom of its round hand. */
const SLEEVES = {
  front: {
    right: {
      inner: [
        [57, 225],
        [57, 345],
        [56, 355],
        [55, 370],
        [52, 385],
        [45, 395],
      ],
      shoulder: JOINTS.front.shoulderRight,
      cap: 8,
      side: 'left',
    },
    left: {
      inner: [
        [161, 225],
        [161, 300],
        [162, 330],
        [162, 350],
        [162, 370],
        [165, 382],
        [171, 395],
      ],
      shoulder: JOINTS.front.shoulderLeft,
      cap: 8,
      side: 'right',
    },
  },
  threeQuarterLeft: {
    right: {
      inner: [
        [43, 228],
        [42, 345],
        [39, 355],
        [38, 370],
        [36, 382],
        [33, 395],
      ],
      shoulder: JOINTS.threeQuarterLeft.shoulderRight,
      cap: 8,
      side: 'left',
    },
    left: {
      inner: [
        [120, 232],
        [119, 350],
        [126, 360],
        [125, 372],
        [127, 382],
        [133, 395],
      ],
      shoulder: JOINTS.threeQuarterLeft.shoulderLeft,
      cap: 8,
      side: 'right',
    },
  },
  back: {
    // her right sleeve, on the viewer's right
    right: {
      inner: [
        [166, 235],
        [166, 310],
        [166, 330],
        [168, 350],
        [170, 365],
        [172, 382],
        [176, 395],
      ],
      shoulder: JOINTS.back.shoulderRight,
      cap: 8,
      side: 'right',
    },
    left: {
      inner: [
        [51, 235],
        [51, 330],
        [50, 345],
        [49, 360],
        [47, 375],
        [45, 386],
        [42, 395],
      ],
      shoulder: JOINTS.back.shoulderLeft,
      cap: 8,
      side: 'left',
    },
  },
} as const satisfies Readonly<Record<CutView, { readonly right: Sleeve; readonly left: Sleeve }>>;

const frontRight = sleeve(SLEEVES.front.right);
const frontLeft = sleeve(SLEEVES.front.left);
const quarterRight = sleeve(SLEEVES.threeQuarterLeft.right);
const quarterLeft = sleeve(SLEEVES.threeQuarterLeft.left);
const backRight = sleeve(SLEEVES.back.right);
const backLeft = sleeve(SLEEVES.back.left);

const FRONT: PartCut = {
  parts: [
    {
      name: 'armRight',
      take: frontRight.take,
      unless: [...frontRight.unless, VEIL.front],
      pivot: JOINTS.front.shoulderRight,
    },
    {
      name: 'armLeft',
      take: frontLeft.take,
      unless: [...frontLeft.unless, VEIL.front],
      pivot: JOINTS.front.shoulderLeft,
    },
    // above the chin, the veil's top with it
    { name: 'head', take: [box(-1, -1, FAR, 167)] },
    { name: 'robe', take: [box(-1, HIP, FAR, FAR)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
};

const THREE_QUARTER_LEFT: PartCut = {
  parts: [
    {
      name: 'armRight',
      take: quarterRight.take,
      unless: [...quarterRight.unless, VEIL.threeQuarterLeft],
      pivot: JOINTS.threeQuarterLeft.shoulderRight,
    },
    {
      name: 'armLeft',
      take: quarterLeft.take,
      unless: [...quarterLeft.unless, VEIL.threeQuarterLeft],
      pivot: JOINTS.threeQuarterLeft.shoulderLeft,
    },
    { name: 'head', take: [box(-1, -1, FAR, 175)] },
    { name: 'robe', take: [box(-1, HIP, FAR, FAR)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
};

const BACK: PartCut = {
  parts: [
    {
      name: 'armRight',
      take: backRight.take,
      unless: [...backRight.unless, VEIL.back],
      pivot: JOINTS.back.shoulderRight,
    },
    {
      name: 'armLeft',
      take: backLeft.take,
      unless: [...backLeft.unless, VEIL.back],
      pivot: JOINTS.back.shoulderLeft,
    },
    // the veil's rows above where her chin is from in front
    { name: 'head', take: [box(-1, -1, FAR, 170)] },
    { name: 'robe', take: [box(-1, HIP, FAR, FAR)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
};

/** Her sheet's outline ink (measured on the turnaround: 11,2,0 to 13,3,1). */
const INK = [12, 2, 0, 255] as const;

/** Where her body's sides run under her arms: out to her shoulders and robe, not in at the sleeves' inner edges. */
const SIDES = sides({ pronoun: 'her', lower: 'robe', cloth: 'the blue robe and its soft folds' });

/** The paper grain her sheet shows on her body, carried into the paint under her arms. */
const GRAIN = grain('the blue robe of her body');

/** What every view of her keeps as it is. */
const KEEP = `Keep every other pixel exactly as it is: the same white veil and its hem, face, robe, feet, ground line, size, position and framing.`;

/**
 * Each view's moving parts (what a pose moves, whose areas are painted
 * magenta and repainted beneath), and the words okra repaints them by: what
 * lies under them, in the sheet's own style.
 */
const HIDDEN_ENTRIES = {
  front: {
    moving: ['armRight', 'armLeft'],
    prompt: `${CUT_AWAY} her two arms (blue sleeves and round hands) were cut away to make a cut-out puppet. She is a young mother in a long blue robe, a white veil over her head and shoulders, standing facing the viewer with her arms hanging straight at her sides. Repaint ONLY the magenta areas, as what lies underneath her arms: the sides of her body below the veil's hem, down to her robe, each side closed by the same thick dark brown-black outline as the rest of her, painted in exactly the same style, colours and soft shading as her robe beside each arm. ${SIDES} ${shade('her')} ${GRAIN} There are no arms now: no sleeves, no hands, nothing magenta left. Where the magenta lay outside her body, it becomes the plain cream paper. ${KEEP}`,
  },
  threeQuarterLeft: {
    moving: ['armRight', 'armLeft'],
    prompt: `${CUT_AWAY} her two arms (blue sleeves and round hands) were cut away to make a cut-out puppet. She is a young mother in a long blue robe, a white veil over her head and shoulders, standing turned three-quarters to the viewer's left with her arms hanging straight at her sides. Repaint ONLY the magenta areas, as what lies underneath her arms: the sides of her body below the veil's hem, down to her robe, each side closed by the same thick dark brown-black outline as the rest of her, painted in exactly the same style, colours and soft shading as her robe beside each arm (her front on the viewer's left, her far side and its deeper shade on the viewer's right). ${SIDES} ${shade('her')} ${GRAIN} There are no arms now: no sleeves, no hands, nothing magenta left. Where the magenta lay outside her body, it becomes the plain cream paper. ${KEEP}`,
  },
  back: {
    moving: ['armRight', 'armLeft'],
    prompt: `${CUT_AWAY} her two arms (blue sleeves and round hands) were cut away to make a cut-out puppet. She is a young mother in a long blue robe, a white veil over her head and shoulders, seen from behind, with her arms hanging straight at her sides. Repaint ONLY the magenta areas, as what lies underneath her arms: the sides of her back below the veil's hem, down to her robe, each side closed by the same thick dark brown-black outline as the rest of her, painted in exactly the same style, colours and soft shading as her robe beside each arm. ${SIDES} ${shade('her')} ${GRAIN} There are no arms now: no sleeves, no hands, nothing magenta left. Where the magenta lay outside her body, it becomes the plain cream paper. ${KEEP}`,
  },
} as const satisfies Readonly<Record<CutView, HiddenEntry>>;

export const { CUTS, cutOptionsFor, HIDDEN } = cutTable({
  frames: FRAMES,
  views: {
    front: { cut: FRONT, figure: 'framed' },
    threeQuarterLeft: { cut: THREE_QUARTER_LEFT, figure: 'framed' },
    back: { cut: BACK, figure: 'framed' },
  },
  hidden: HIDDEN_ENTRIES,
  ink: INK,
});
