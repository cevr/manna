import type { HiddenEntry, PartCut, PartRule, SheetClean } from '@manna/film/tools';
import { Record as Records } from 'effect';
import { type PaperRim, clearPaperRim } from '../../../../../library/cutout/clean.ts';
import { CUT_AWAY, grain, shade, sides } from '../../../../../library/cutout/prompts.ts';
import { FAR, type Sleeve, box, sleeve } from '../../../../../library/cutout/rules.ts';
import { cutTable } from '../../../../../library/cutout/table.ts';
import { FRAMES } from './frames.ts';
import { JOINTS } from './joints.ts';
import { POSES_PAPERS, TURNAROUND_PAPERS } from './papers.ts';

export { FRAMES, JOINTS };

/** A view of hers, by its name in her sheets' views. */
type CutView = keyof typeof FRAMES;

/** A view of hers holding the baby, whose arms are cut by their own outlines rather than by a sleeve's edge. */
type PoseView = 'poses-1' | 'poses-2' | 'poses-3';

/** A turnaround view that shows both her arms: in profile only the near one shows, and her veil hangs behind it. */
type TwoArmView = Exclude<CutView, 'profileLeft' | 'profileRight' | PoseView>;

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
    { name: 'head', take: [box(-1, -1, FAR, 176)] },
    { name: 'robe', take: [box(-1, HIP, FAR, FAR)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
};

const PROFILE_LEFT: PartCut = {
  parts: [
    {
      name: 'armLeft',
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

/** Her hip's row in each pose (below her hands' reach, standing or seated): the robe is every row below it that her arms, the baby and the stool leave. */
const POSE_HIP = 445;

const POSES_1: PartCut = {
  parts: [
    {
      name: 'armRight',
      take: [
        {
          polygon: [
            [-1, 296],
            [66, 296],
            [60, 308],
            [54, 316],
            [54, 350],
            [74, 360],
            [74, 425],
            [100, 432],
            [100, 439],
            [50, 439],
            [26, 425],
            [10, 410],
            [-1, 395],
          ],
        },
        { disc: { c: [112, 391], r: 42 } },
      ],
      pivot: JOINTS['poses-1'].shoulderRight,
    },
    {
      name: 'armLeft',
      take: [
        { disc: { c: [206, 293], r: 41 } },
        {
          polygon: [
            [243, 262],
            [266, 296],
            [280, 296],
            [280, 250],
            [300, 250],
            [314, 280],
            [322, 300],
            [330, 325],
            [333, 360],
            [332, 385],
            [314, 410],
            [244, 410],
            [224, 395],
            [210, 380],
            [196, 365],
            [186, 350],
            [178, 334],
          ],
        },
      ],
      pivot: JOINTS['poses-1'].shoulderLeft,
    },
    {
      name: 'cup',
      take: [
        {
          polygon: [
            [122, 262],
            [150, 244],
            [180, 248],
            [182, 300],
            [150, 304],
            [124, 290],
          ],
        },
      ],
    },
    {
      name: 'baby',
      take: [
        {
          polygon: [
            [-1, 320],
            [-1, 236],
            [18, 212],
            [40, 190],
            [66, 176],
            [100, 169],
            [134, 178],
            [140, 196],
            [147, 206],
            [152, 214],
            [156, 222],
            [160, 232],
            [168, 242],
            [150, 244],
            [122, 262],
            [124, 290],
            [110, 305],
            [60, 305],
          ],
        },
        {
          polygon: [
            [50, 300],
            [200, 330],
            [230, 385],
            [250, 410],
            [240, 440],
            [200, 465],
            [100, 468],
            [60, 440],
          ],
        },
      ],
    },
    { name: 'head', take: [box(-1, -1, FAR, 238)] },
    { name: 'robe', take: [box(-1, POSE_HIP, FAR, FAR)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
};

const POSES_2: PartCut = {
  parts: [
    {
      name: 'armRight',
      take: [
        {
          polygon: [
            [56, 282],
            [66, 266],
            [90, 258],
            [112, 258],
            [114, 342],
            [124, 372],
            [150, 388],
            [175, 398],
            [150, 476],
            [115, 471],
            [78, 457],
            [44, 446],
            [25, 430],
            [24, 400],
            [25, 352],
            [40, 336],
            [48, 316],
          ],
        },
        { disc: { c: [181, 437], r: 40 } },
      ],
      pivot: JOINTS['poses-2'].shoulderRight,
    },
    {
      name: 'armLeft',
      take: [
        { disc: { c: [262, 410], r: 40 } },
        {
          polygon: [
            [312, 340],
            [322, 330],
            [340, 326],
            [357, 345],
            [357, 425],
            [350, 440],
            [298, 440],
            [290, 445],
            [304, 378],
            [310, 362],
            [315, 346],
          ],
        },
      ],
      pivot: JOINTS['poses-2'].shoulderLeft,
    },
    {
      name: 'baby',
      take: [
        {
          polygon: [
            [248, 205],
            [300, 199],
            [332, 213],
            [348, 233],
            [357, 256],
            [357, 292],
            [346, 312],
            [338, 326],
            [330, 350],
            [325, 380],
            [320, 400],
            [300, 420],
            [262, 430],
            [200, 440],
            [160, 440],
            [150, 420],
            [155, 380],
            [175, 350],
            [200, 330],
            [225, 318],
            [216, 304],
            [212, 286],
            [212, 266],
            [214, 252],
            [219, 244],
            [226, 236],
            [233, 226],
            [240, 215],
          ],
        },
      ],
    },
    { name: 'head', take: [box(-1, -1, FAR, 240)] },
    {
      name: 'stool',
      take: [
        {
          polygon: [
            [-1, 520],
            [36, 520],
            [48, 532],
            [66, 545],
            [92, 550],
            [104, 560],
            [107, 580],
            [102, 605],
            [96, 630],
            [90, 655],
            [90, 712],
            [-1, 712],
          ],
        },
        {
          polygon: [
            [378, 520],
            [FAR, 520],
            [FAR, 712],
            [392, 712],
            [392, 660],
            [388, 630],
            [385, 600],
            [382, 570],
            [378, 540],
          ],
        },
      ],
    },
    { name: 'robe', take: [box(-1, POSE_HIP, FAR, FAR)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
};

const POSES_3: PartCut = {
  parts: [
    {
      name: 'armRight',
      take: [
        { disc: { c: [165, 435], r: 39 } },
        {
          polygon: [
            [56, 286],
            [64, 268],
            [86, 256],
            [104, 254],
            [104, 355],
            [112, 380],
            [128, 386],
            [148, 398],
            [150, 474],
            [100, 472],
            [70, 472],
            [52, 458],
            [33, 440],
            [24, 410],
            [26, 365],
            [36, 350],
            [44, 330],
            [50, 312],
            [58, 290],
          ],
        },
      ],
      pivot: JOINTS['poses-3'].shoulderRight,
    },
    {
      name: 'armLeft',
      take: [
        { disc: { c: [221, 397], r: 39 } },
        {
          polygon: [
            [292, 302],
            [312, 296],
            [322, 312],
            [328, 330],
            [334, 350],
            [337, 375],
            [337, 395],
            [333, 410],
            [322, 425],
            [304, 440],
            [286, 448],
            [250, 450],
          ],
        },
      ],
      pivot: JOINTS['poses-3'].shoulderLeft,
    },
    {
      name: 'baby',
      take: [
        {
          polygon: [
            [236, 172],
            [292, 166],
            [310, 180],
            [322, 196],
            [330, 212],
            [336, 228],
            [337, 262],
            [330, 282],
            [322, 296],
            [312, 300],
            [305, 320],
            [300, 350],
            [292, 365],
            [260, 370],
            [240, 362],
            [200, 370],
            [170, 385],
            [140, 392],
            [140, 370],
            [160, 345],
            [185, 320],
            [212, 298],
            [204, 284],
            [198, 268],
            [194, 252],
            [190, 240],
            [195, 226],
            [203, 218],
            [209, 210],
            [214, 203],
            [220, 196],
            [226, 189],
            [232, 182],
          ],
        },
      ],
    },
    { name: 'head', take: [box(-1, -1, FAR, 232)] },
    { name: 'robe', take: [box(-1, POSE_HIP, FAR, FAR)] },
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
  'poses-1': {
    moving: ['armRight', 'armLeft'],
    prompt: `${CUT_AWAY} her two arms (blue sleeves and round hands) were cut away to make a cut-out puppet. She is a young mother in a long blue robe, a white veil over her head and shoulders, standing and holding her baby, who is wrapped in a white swaddle, against her; a small cup is at his mouth. Repaint ONLY the magenta areas, as what lies underneath her arms: where the magenta lay over the baby, his white swaddle with its soft folds; elsewhere her body in her blue robe below the veil's hem, each side closed by the same thick dark brown-black outline as the rest of her, painted in exactly the same style, colours and soft shading as her robe beside each arm. ${shade('her')} ${GRAIN} The baby, his face and the cup stay exactly as they are. There are no arms now: no sleeves, no hands, nothing magenta left. Where the magenta lay outside her body, it becomes the plain cream paper. ${KEEP}`,
  },
  'poses-2': {
    moving: ['armRight', 'armLeft'],
    prompt: `${CUT_AWAY} her two arms (blue sleeves and round hands) were cut away to make a cut-out puppet. She is a young mother in a long blue robe, a white veil over her head and shoulders, seated on a wooden stool with her baby, who is wrapped in a white swaddle, on her lap. Repaint ONLY the magenta areas, as what lies underneath her arms: where the magenta lay over the baby, his white swaddle with its soft folds; elsewhere her body and lap in her blue robe below the veil's hem, each side closed by the same thick dark brown-black outline as the rest of her, painted in exactly the same style, colours and soft shading as her robe beside each arm. ${shade('her')} ${GRAIN} The baby, his face and the stool stay exactly as they are. There are no arms now: no sleeves, no hands, nothing magenta left. Where the magenta lay outside her body, it becomes the plain cream paper. ${KEEP}`,
  },
  'poses-3': {
    moving: ['armRight', 'armLeft'],
    prompt: `${CUT_AWAY} her two arms (blue sleeves and round hands) were cut away to make a cut-out puppet. She is a young mother in a long blue robe, a white veil over her head and shoulders, standing and holding her baby, who is wrapped in a white swaddle, high against her shoulder. Repaint ONLY the magenta areas, as what lies underneath her arms: where the magenta lay over the baby, his white swaddle with its soft folds; elsewhere her body in her blue robe below the veil's hem, each side closed by the same thick dark brown-black outline as the rest of her, painted in exactly the same style, colours and soft shading as her robe beside each arm. ${shade('her')} ${GRAIN} The baby and his face stay exactly as they are. There are no arms now: no sleeves, no hands, nothing magenta left. Where the magenta lay outside her body, it becomes the plain cream paper. ${KEEP}`,
  },
} as const satisfies Readonly<Record<CutView, HiddenEntry>>;

export const { CUTS, cutOptionsFor, HIDDEN, GAPS, paperOf } = cutTable({
  frames: FRAMES,
  views: {
    front: { cut: FRONT, figure: 'framed' },
    threeQuarterLeft: { cut: THREE_QUARTER_LEFT, figure: 'framed' },
    back: {
      cut: BACK,
      figure: 'framed',
      gaps: [{ at: [105, 582], box: [93, 576, 119, 589], why: 'the ground between her feet' }],
    },
    profileLeft: { cut: PROFILE_LEFT, figure: 'framed' },
    profileRight: { cut: PROFILE_RIGHT, figure: 'framed' },
    threeQuarterRight: { cut: THREE_QUARTER_RIGHT, figure: 'framed' },
    'poses-1': { cut: POSES_1, figure: 'framed' },
    'poses-2': {
      cut: POSES_2,
      figure: 'framed',
      gaps: [
        {
          at: [84, 633],
          box: [64, 584, 105, 684],
          why: 'the ground between the bench leg and her skirt',
        },
      ],
    },
    'poses-3': { cut: POSES_3, figure: 'framed' },
  },
  hidden: HIDDEN_ENTRIES,
  ink: INK,
});

/** How far the clear ground's flood reaches through paper-coloured pixels, 8-steps: her band runs 1 to 5 px wide, and where it meets the fading edge of her ground shadow up to 19, so one pass clears it all; a gap in her ink could let it into her cream cloth no farther. */
const RIM_BAND_PX_PAST_HER_19_AT_THE_SHADOW_EDGE = 24;

/** A pixel is paper-coloured within this ΔE76 of the view's paper: her band lies about 5 from it, her ink's blend 20 or more. */
const RIM_NEAR_DE76_BETWEEN_HER_RIM_5_AND_INK_20 = 12;

/** Each view's paper rim, as her part sheets and her drawings beside them (`sheets-clean.ts`) clear it. */
export const PAPER_RIMS = Records.map(
  { ...TURNAROUND_PAPERS, ...POSES_PAPERS },
  (paper): PaperRim => ({
    paper,
    band: RIM_BAND_PX_PAST_HER_19_AT_THE_SHADOW_EDGE,
    near: RIM_NEAR_DE76_BETWEEN_HER_RIM_5_AND_INK_20,
  }),
);

/** What each view's laid part sheet runs before it is written (`film concept parts`): every view clears the pale paper band her paint keeps just outside her ink (251,243,226 at the median on poses-1, against its paper 253,240,215), which her un-matte would read as her cream cloth and draw as a white torn rim. */
export const CLEAN = Records.map(PAPER_RIMS, clearPaperRim) satisfies Partial<
  Record<keyof typeof CUTS, SheetClean>
>;
