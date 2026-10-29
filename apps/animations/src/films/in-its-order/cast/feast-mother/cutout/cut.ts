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

/** A view that shows both her arms: in profile only the near one shows, and her veil hangs behind it. */
type TwoArmView = Exclude<CutView, 'profileLeft' | 'profileRight'>;

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
  // her veil runs lower on her far side's front (the viewer's left), its hem's corner below her right sleeve's top
  threeQuarterRight: {
    polygon: [
      [-1, -1],
      [FAR, -1],
      [FAR, 234],
      [214, 236],
      [206, 244],
      [196, 248],
      [52, 248],
      [50, 252],
      [46, 264],
      [25, 265],
      [12, 256],
      [4, 247],
      [-1, 240],
    ],
  },
} as const satisfies Readonly<Record<TwoArmView, PartRule>>;

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
  // turned to the viewer's right: her near right sleeve's inner edge is the crease's far side, her far left sleeve's the crease before it
  threeQuarterRight: {
    right: {
      inner: [
        [93, 238],
        [93, 350],
        [88, 360],
        [87, 372],
        [85, 385],
        [78, 395],
      ],
      shoulder: JOINTS.threeQuarterRight.shoulderRight,
      cap: 8,
      side: 'left',
    },
    left: {
      inner: [
        [166, 238],
        [167, 250],
        [170, 270],
        [171, 290],
        [175, 302],
        [172, 320],
        [175, 340],
        [176, 350],
        [179, 360],
        [179, 382],
        [184, 392],
        [188, 397],
      ],
      shoulder: JOINTS.threeQuarterRight.shoulderLeft,
      cap: 8,
      side: 'right',
    },
  },
} as const satisfies Readonly<
  Record<TwoArmView, { readonly right: Sleeve; readonly left: Sleeve }>
>;

/**
 * In profile to the viewer's left, her left sleeve's back edge: a soft crease
 * from her lighter back, then out round the cuff's ink.
 */
const PL_LEFT: Sleeve = {
  inner: [
    [102, 190],
    [105, 200],
    [107, 210],
    [108, 220],
    [109, 230],
    [109, 270],
    [107, 295],
    [105, 320],
    [103, 340],
    [110, 350],
    [118, 357],
  ],
  shoulder: JOINTS.profileLeft.shoulderLeft,
  cap: 10,
  side: 'left',
};
/** Before her left sleeve's front crease, which stays with the sleeve: her body's front, down past her hand. */
const PL_FRONT = {
  polygon: [
    [-1, 195],
    [76, 195],
    [74, 215],
    [69, 230],
    [69, 250],
    [67, 260],
    [65, 280],
    [63, 300],
    [61, 310],
    [61, 320],
    [59, 330],
    [58, 340],
    [57, 352],
    [59, 360],
    [60, 380],
    [62, 388],
    [70, 397],
    [76, 404],
    [76, 410],
    [-1, 410],
  ],
} as const;

/** In profile to the viewer's right, her right sleeve's back edge: where her lighter back meets the sleeve's mid blue, then out round the cuff. */
const PR_RIGHT: Sleeve = {
  inner: [
    [99, 190],
    [96, 200],
    [94, 210],
    [93, 220],
    [93, 270],
    [94, 295],
    [95, 320],
    [94, 340],
    [90, 350],
    [85, 357],
  ],
  shoulder: JOINTS.profileRight.shoulderRight,
  cap: 10,
  side: 'right',
};
/** Past her right sleeve's front crease, which stays with the sleeve: her body's front, down past her hand. */
const PR_FRONT = {
  polygon: [
    [FAR, 195],
    [126, 195],
    [128, 215],
    [132, 225],
    [134, 235],
    [136, 250],
    [138, 265],
    [140, 280],
    [142, 295],
    [143, 310],
    [145, 325],
    [146, 340],
    [147, 352],
    [144, 358],
    [142, 365],
    [142, 382],
    [138, 388],
    [134, 395],
    [127, 402],
    [127, 410],
    [FAR, 410],
  ],
} as const;

const frontRight = sleeve(SLEEVES.front.right);
const frontLeft = sleeve(SLEEVES.front.left);
const quarterRight = sleeve(SLEEVES.threeQuarterLeft.right);
const quarterLeft = sleeve(SLEEVES.threeQuarterLeft.left);
const backRight = sleeve(SLEEVES.back.right);
const backLeft = sleeve(SLEEVES.back.left);
const nearRight = sleeve(SLEEVES.threeQuarterRight.right);
const farLeft = sleeve(SLEEVES.threeQuarterRight.left);
const plLeft = sleeve(PL_LEFT);
const prRight = sleeve(PR_RIGHT);

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

const THREE_QUARTER_RIGHT: PartCut = {
  parts: [
    {
      name: 'armRight',
      take: nearRight.take,
      unless: [...nearRight.unless, VEIL.threeQuarterRight],
      pivot: JOINTS.threeQuarterRight.shoulderRight,
    },
    {
      name: 'armLeft',
      take: farLeft.take,
      unless: [...farLeft.unless, VEIL.threeQuarterRight],
      pivot: JOINTS.threeQuarterRight.shoulderLeft,
    },
    // above her chin's underside ink
    { name: 'head', take: [box(-1, -1, FAR, 176)] },
    { name: 'robe', take: [box(-1, HIP, FAR, FAR)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
};

// In profile her veil hangs behind her, off the shoulder, so no veil bounds her
// one sleeve: its back edge does, and her body's front before its front crease.
const PROFILE_LEFT: PartCut = {
  parts: [
    {
      name: 'armLeft',
      // her round hand, whose ink crosses the sleeve's back edge
      take: [...plLeft.take, { disc: { c: [87, 375], r: 26 } }],
      unless: [...plLeft.unless, PL_FRONT],
      pivot: JOINTS.profileLeft.shoulderLeft,
    },
    { name: 'head', take: [box(-1, -1, FAR, 164)] },
    { name: 'robe', take: [box(-1, HIP, FAR, FAR)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
};

const PROFILE_RIGHT: PartCut = {
  parts: [
    {
      name: 'armRight',
      take: [...prRight.take, { disc: { c: [114.5, 374], r: 26 } }],
      unless: [...prRight.unless, PR_FRONT],
      pivot: JOINTS.profileRight.shoulderRight,
    },
    { name: 'head', take: [box(-1, -1, FAR, 164)] },
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
  profileLeft: {
    moving: ['armLeft'],
    prompt: `${CUT_AWAY} her left arm (its blue sleeve and round hand) was cut away to make a cut-out puppet. She is a young mother in a long blue robe, a white veil over her head that hangs down her back, seen in profile facing the viewer's left, with her arm hanging straight at her side; her other arm does not show. Repaint ONLY the magenta areas, as what lies underneath her arm: the side of her body from the armpit down to her robe, between her back and her front, closed by the same thick dark brown-black outline as the rest of her where it meets the paper, painted in exactly the same style, colours and soft shading as her robe beside the arm. ${shade('her')} ${GRAIN} There is no arm now: no sleeve, no hand, nothing magenta left. Where the magenta lay outside her body, it becomes the plain cream paper. ${KEEP}`,
  },
  profileRight: {
    moving: ['armRight'],
    prompt: `${CUT_AWAY} her right arm (its blue sleeve and round hand) was cut away to make a cut-out puppet. She is a young mother in a long blue robe, a white veil over her head that hangs down her back, seen in profile facing the viewer's right, with her arm hanging straight at her side; her other arm does not show. Repaint ONLY the magenta areas, as what lies underneath her arm: the side of her body from the armpit down to her robe, between her back and her front, closed by the same thick dark brown-black outline as the rest of her where it meets the paper, painted in exactly the same style, colours and soft shading as her robe beside the arm. ${shade('her')} ${GRAIN} There is no arm now: no sleeve, no hand, nothing magenta left. Where the magenta lay outside her body, it becomes the plain cream paper. ${KEEP}`,
  },
  threeQuarterRight: {
    moving: ['armRight', 'armLeft'],
    prompt: `${CUT_AWAY} her two arms (blue sleeves and round hands) were cut away to make a cut-out puppet. She is a young mother in a long blue robe, a white veil over her head and shoulders, standing turned three-quarters to the viewer's right with her arms hanging straight at her sides. Repaint ONLY the magenta areas, as what lies underneath her arms: the sides of her body below the veil's hem, down to her robe, each side closed by the same thick dark brown-black outline as the rest of her, painted in exactly the same style, colours and soft shading as her robe beside each arm (her front on the viewer's right, her near side on the viewer's left, her far side and its deeper shade on the viewer's right). ${SIDES} ${shade('her')} ${GRAIN} There are no arms now: no sleeves, no hands, nothing magenta left. Where the magenta lay outside her body, it becomes the plain cream paper. ${KEEP}`,
  },
} as const satisfies Readonly<Record<CutView, HiddenEntry>>;

export const { CUTS, cutOptionsFor, HIDDEN } = cutTable({
  frames: FRAMES,
  views: {
    front: { cut: FRONT, figure: 'framed' },
    threeQuarterLeft: { cut: THREE_QUARTER_LEFT, figure: 'framed' },
    back: { cut: BACK, figure: 'framed' },
    profileLeft: { cut: PROFILE_LEFT, figure: 'framed' },
    profileRight: { cut: PROFILE_RIGHT, figure: 'framed' },
    threeQuarterRight: { cut: THREE_QUARTER_RIGHT, figure: 'framed' },
  },
  hidden: HIDDEN_ENTRIES,
  ink: INK,
});
