import type { HiddenEntry, PartCut, PartRule, SheetClean } from '@manna/film/tools';
import { Record as Records } from 'effect';
import { type PaperRim, clearPaperRim } from '../../../cutout/clean.ts';
import { CUT_AWAY, grain, shade, sides } from '../../../cutout/prompts.ts';
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
import { POSES_PAPERS, TURNAROUND_PAPERS } from './papers.ts';

export { FRAMES, JOINTS };

type CutView = keyof typeof FRAMES;

const FRONT_HEM: Hem = [518, 126, 6, 90];
const FRONT_RIGHT: Sleeve = {
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
    { name: 'head', take: [box(-1, -1, FAR, 186)] },
    {
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
    { name: 'shadow', role: 'shadow', take: [belowHem(...FRONT_HEM)] },
    { name: 'robe', take: [box(-1, 331, FAR, FAR)], unless: [box(157, 309, 206, 413)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
};

const TQL_HEM = {
  right: [
    [28, 509],
    [41, 516],
    [42, 525],
    [60, 536],
    [64, 520],
    [86, 523],
    [95, 524],
  ],
  left: [
    [136, 524],
    [141, 536],
    [160, 525],
    [180, 531],
    [181, 518],
    [199, 512],
  ],
} as const;
const TQL_RIGHT: Sleeve = {
  inner: [
    [49, 190],
    [48.5, 200],
    [48, 210],
    [47.5, 220],
    [46.5, 240],
    [45.5, 260],
    [44, 280],
    [44.5, 290],
    [43.5, 300],
    [42.5, 310],
    [41.5, 320],
    [41, 330],
    [40.5, 340],
    [43.5, 346],
  ],
  shoulder: JOINTS.threeQuarterLeft.shoulderRight,
  cap: 12,
  side: 'left',
};
const TQL_LEFT: Sleeve = {
  inner: [
    [172.5, 181],
    [169.5, 190],
    [168, 200],
    [167, 210],
    [166.5, 220],
    [167.5, 230],
    [167.5, 270],
    [168.5, 280],
    [167.5, 290],
    [170, 300],
    [170, 310],
    [171, 320],
    [172, 330],
    [172, 340],
    [176, 346],
  ],
  shoulder: JOINTS.threeQuarterLeft.shoulderLeft,
  cap: 8,
  side: 'right',
};
const tqlRight = sleeve(TQL_RIGHT);
const tqlLeft = sleeve(TQL_LEFT);
const TQL_SOLES = {
  right: [
    [20, 20, 545],
    [21, 21, 546],
    [22, 22, 547],
    [23, 78, 548],
    [79, 90, 547],
    [91, 93, 546],
    [94, 94, 545],
    [95, 95, 544],
    [96, 96, 540],
  ],
  left: [
    [131, 131, 541],
    [132, 132, 545],
    [133, 133, 546],
    [134, 135, 547],
    [136, 189, 548],
    [190, 191, 547],
    [192, 192, 546],
    [193, 193, 544],
  ],
} as const satisfies Readonly<Record<string, SoleRuns>>;

const THREE_QUARTER_LEFT: PartCut = {
  parts: [
    {
      name: 'armRight',
      take: [...tqlRight.take, { disc: { c: [21.5, 369], r: 24 } }],
      unless: tqlRight.unless,
      pivot: JOINTS.threeQuarterLeft.shoulderRight,
    },
    { name: 'head', take: [box(-1, -1, FAR, 169), box(187, 150, 213, 205)] },
    {
      name: 'armLeft',
      take: [...tqlLeft.take, { disc: { c: [199.5, 369.5], r: 23.5 } }],
      unless: tqlLeft.unless,
      pivot: JOINTS.threeQuarterLeft.shoulderLeft,
    },
    {
      name: 'footRight',
      take: [{ polygon: [[10, 509], ...TQL_HEM.right, [113, 524], [113, 570], [10, 570]] }],
      unless: [underSole(TQL_SOLES.right)],
    },
    {
      name: 'footLeft',
      take: [{ polygon: [[113, 524], ...TQL_HEM.left, [210, 512], [210, 570], [113, 570]] }],
      unless: [underSole(TQL_SOLES.left)],
    },
    {
      name: 'shadow',
      role: 'shadow',
      take: [
        {
          polygon: [
            [-1, 509],
            ...TQL_HEM.right,
            ...TQL_HEM.left,
            [FAR, 512],
            [FAR, FAR],
            [-1, FAR],
          ],
        },
      ],
    },
    { name: 'robe', take: [box(-1, 330, FAR, FAR)], unless: [box(132, 304, 202, 418)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
};

const BACK_HEM = {
  left: [
    [40, 510],
    [57, 518],
    [58, 529],
    [62, 527],
    [70, 533],
    [85, 523],
    [101, 536],
    [108, 525],
  ],
  right: [
    [148, 525],
    [155, 537],
    [170, 522],
    [185, 528],
    [195, 537],
    [197, 529],
    [198, 518],
    [216, 510],
  ],
} as const;
const BACK_RIGHT: Sleeve = {
  inner: [
    [200, 200],
    [200, 210],
    [199, 220],
    [199, 230],
    [199, 240],
    [198.5, 250],
    [199.5, 260],
    [199.5, 270],
    [200, 280],
    [200, 290],
    [201, 300],
    [200.5, 310],
    [201.5, 320],
    [202.5, 330],
    [204, 340],
    [205, 348],
  ],
  shoulder: JOINTS.back.shoulderRight,
  cap: 14,
  side: 'right',
};
const BACK_LEFT: Sleeve = {
  inner: [
    [56, 200],
    [56, 210],
    [56.5, 220],
    [56.5, 250],
    [57, 260],
    [56.5, 270],
    [56, 280],
    [56, 320],
    [53, 330],
    [52, 336],
    [50, 342],
    [50, 348],
  ],
  shoulder: JOINTS.back.shoulderLeft,
  cap: 14,
  side: 'left',
};
const backRight = sleeve(BACK_RIGHT);
const backLeft = sleeve(BACK_LEFT);
const BACK_SOLES = {
  left: [
    [41, 41, 545],
    [42, 42, 546],
    [43, 43, 547],
    [44, 45, 548],
    [46, 107, 549],
    [108, 108, 548],
    [109, 109, 547],
    [110, 110, 546],
  ],
  right: [
    [146, 146, 545],
    [147, 148, 547],
    [149, 150, 548],
    [151, 211, 549],
    [212, 213, 548],
    [214, 214, 547],
    [215, 215, 546],
  ],
} as const satisfies Readonly<Record<string, SoleRuns>>;

const BACK: PartCut = {
  parts: [
    {
      name: 'head',
      take: [
        {
          polygon: [
            [-1, -1],
            [FAR, -1],
            [FAR, 183],
            [200, 183],
            [194, 193],
            [183, 193],
            [177, 203],
            [166, 203],
            [159, 213],
            [90, 213],
            [81, 203],
            [68, 203],
            [62, 193],
            [-1, 193],
          ],
        },
      ],
    },
    {
      name: 'armRight',
      take: [...backRight.take, { disc: { c: [225.5, 369.5], r: 23.5 } }],
      unless: backRight.unless,
      pivot: JOINTS.back.shoulderRight,
    },
    {
      name: 'armLeft',
      take: [...backLeft.take, { disc: { c: [29, 370], r: 24 } }],
      unless: backLeft.unless,
      pivot: JOINTS.back.shoulderLeft,
    },
    {
      name: 'footRight',
      take: [{ polygon: [[128, 525], ...BACK_HEM.right, [226, 510], [226, 580], [128, 580]] }],
      unless: [underSole(BACK_SOLES.right)],
    },
    {
      name: 'footLeft',
      take: [{ polygon: [[25, 510], ...BACK_HEM.left, [128, 525], [128, 580], [25, 580]] }],
      unless: [underSole(BACK_SOLES.left)],
    },
    {
      name: 'shadow',
      role: 'shadow',
      take: [
        {
          polygon: [
            [-1, 510],
            ...BACK_HEM.left,
            ...BACK_HEM.right,
            [FAR, 510],
            [FAR, FAR],
            [-1, FAR],
          ],
        },
      ],
    },
    { name: 'robe', take: [box(-1, 331, FAR, FAR)], unless: [box(32, 316, 112, 427)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
};

const PL_HEM = {
  left: [
    [10, 510],
    [22, 515],
    [23, 525],
    [39, 537],
    [43, 519],
    [56, 521],
    [68, 522],
  ],
  right: [
    [71, 527],
    [100, 538],
    [105, 520],
    [137, 522],
    [142, 534],
    [147, 518],
    [161, 512],
  ],
} as const;
const PL_LEFT: Sleeve = {
  inner: [
    [124, 182],
    [130, 190],
    [133, 200],
    [133, 225],
    [133.5, 230],
    [133.5, 290],
    [135, 294],
    [135, 330],
    [131, 336],
    [132, 351],
  ],
  shoulder: JOINTS.profileLeft.shoulderLeft,
  cap: 12,
  side: 'left',
};
const plLeft = sleeve(PL_LEFT);
const PL_FRONT = {
  polygon: [
    [-1, 170],
    [92, 170],
    [88, 182],
    [86, 188],
    [82, 194],
    [80, 200],
    [73, 240],
    [71, 260],
    [66, 300],
    [62, 310],
    [65, 320],
    [63, 340],
    [63, 352],
    [-1, 352],
  ],
} as const;
const PL_SOLES = {
  left: [
    [0, 0, 545],
    [1, 1, 546],
    [2, 2, 547],
    [3, 68, 548],
  ],
  right: [
    [69, 147, 548],
    [148, 149, 547],
    [150, 150, 546],
    [151, 151, 545],
    [152, 152, 544],
  ],
} as const satisfies Readonly<Record<string, SoleRuns>>;

const PROFILE_LEFT: PartCut = {
  parts: [
    {
      name: 'armLeft',
      take: [...plLeft.take, { disc: { c: [92.5, 369], r: 26 } }],
      unless: [...plLeft.unless, PL_FRONT],
      pivot: JOINTS.profileLeft.shoulderLeft,
    },
    { name: 'head', take: [box(-1, -1, FAR, 169), box(112, 150, 175, 228)] },
    {
      name: 'footLeft',
      take: [{ polygon: [[-1, 510], ...PL_HEM.left, [69, 522], [69, 575], [-1, 575]] }],
      unless: [underSole(PL_SOLES.left)],
    },
    {
      name: 'footRight',
      take: [{ polygon: [[69, 522], ...PL_HEM.right, [175, 512], [175, 575], [69, 575]] }],
      unless: [underSole(PL_SOLES.right)],
    },
    {
      name: 'shadow',
      role: 'shadow',
      take: [
        {
          polygon: [[-1, 510], ...PL_HEM.left, ...PL_HEM.right, [FAR, 512], [FAR, FAR], [-1, FAR]],
        },
      ],
    },
    { name: 'robe', take: [box(-1, 330, FAR, FAR)], unless: [box(78, 328, 165, 428)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
};

const PR_HEM = {
  back: [
    [13, 509],
    [21, 515],
    [22, 516],
  ],
  left: [
    [31, 518],
    [36, 534],
    [40, 521],
    [41, 520],
    [66, 523],
    [72, 538],
    [86, 527],
    [101, 532],
  ],
  right: [
    [102, 522],
    [123, 523],
    [130, 537],
    [144, 527],
    [145, 518],
    [157, 513],
  ],
} as const;
const PR_RIGHT: Sleeve = {
  inner: [
    [46, 180],
    [38, 190],
    [35, 195],
    [33, 200],
    [31, 210],
    [29, 220],
    [27, 230],
    [25, 240],
    [23, 260],
    [20, 300],
    [28, 320],
    [31, 330],
    [31, 345],
    [29, 350],
    [30, 357],
  ],
  shoulder: JOINTS.profileRight.shoulderRight,
  cap: 14,
  side: 'right',
};
const prRight = sleeve(PR_RIGHT);
const PR_FRONT = {
  polygon: [
    [FAR, 170],
    [90, 170],
    [90, 180],
    [98, 190],
    [101, 195],
    [97.5, 200],
    [97.5, 340],
    [102, 342],
    [102, 358],
    [FAR, 358],
  ],
} as const;
const PR_SOLES = {
  left: [
    [27, 27, 545],
    [28, 28, 546],
    [29, 29, 547],
    [30, 34, 548],
    [35, 101, 549],
  ],
  right: [
    [102, 158, 549],
    [159, 161, 548],
    [162, 162, 547],
    [163, 163, 546],
  ],
} as const satisfies Readonly<Record<string, SoleRuns>>;

const PROFILE_RIGHT: PartCut = {
  parts: [
    {
      name: 'armRight',
      take: [...prRight.take, { disc: { c: [74.5, 369], r: 28 } }],
      unless: [...prRight.unless, PR_FRONT],
      pivot: JOINTS.profileRight.shoulderRight,
    },
    { name: 'head', take: [box(-1, -1, FAR, 169), box(-1, 150, 40, 233)] },
    {
      name: 'footRight',
      take: [{ polygon: [...PR_HEM.right, [165, 513], [165, 575], [102, 575]] }],
      unless: [underSole(PR_SOLES.right)],
    },
    {
      name: 'footLeft',
      take: [{ polygon: [[27, 517], ...PR_HEM.left, [102, 532], [102, 575], [27, 575]] }],
      unless: [underSole(PR_SOLES.left)],
    },
    {
      name: 'shadow',
      role: 'shadow',
      take: [
        {
          polygon: [
            [-1, 509],
            ...PR_HEM.back,
            ...PR_HEM.left,
            ...PR_HEM.right,
            [FAR, 513],
            [FAR, FAR],
            [-1, FAR],
          ],
        },
      ],
    },
    { name: 'robe', take: [box(-1, 331, FAR, FAR)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
};

const TQR_HEM = {
  right: [
    [29, 511],
    [48, 518],
    [49, 533],
    [70, 525],
    [91, 536],
    [95, 524],
  ],
  left: [
    [130, 524],
    [138, 535],
    [160, 521],
    [166, 536],
    [184, 526],
    [185, 516],
    [199, 508],
  ],
} as const;
const TQR_RIGHT: Sleeve = {
  inner: [
    [67.5, 200],
    [68.5, 210],
    [69, 220],
    [69, 230],
    [69.5, 240],
    [69, 250],
    [69, 260],
    [68, 270],
    [67.5, 280],
    [67.5, 290],
    [66.5, 300],
    [67, 310],
    [65.5, 320],
    [64.5, 330],
    [63.5, 336],
    [62.5, 342],
    [62, 346],
  ],
  shoulder: JOINTS.threeQuarterRight.shoulderRight,
  cap: 14,
  side: 'left',
};
const TQR_LEFT: Sleeve = {
  inner: [
    [180.5, 200],
    [181.5, 210],
    [182.5, 220],
    [183, 230],
    [184, 240],
    [183.5, 250],
    [185, 260],
    [184.5, 270],
    [185.5, 280],
    [186, 290],
    [186, 300],
    [186, 310],
    [186.5, 320],
    [187, 330],
    [187, 339],
    [183.5, 346],
  ],
  shoulder: JOINTS.threeQuarterRight.shoulderLeft,
  cap: 12,
  side: 'right',
};
const tqrRight = sleeve(TQR_RIGHT);
const tqrLeft = sleeve(TQR_LEFT);
const TQR_SOLES = {
  right: [
    [37, 37, 544],
    [38, 38, 546],
    [39, 40, 547],
    [41, 51, 548],
    [52, 88, 549],
    [89, 97, 548],
    [98, 99, 547],
    [100, 100, 546],
    [101, 101, 544],
  ],
  left: [
    [129, 129, 542],
    [130, 130, 544],
    [131, 131, 545],
    [132, 132, 546],
    [133, 145, 547],
    [146, 201, 548],
    [202, 203, 547],
    [204, 204, 546],
    [205, 205, 545],
  ],
} as const satisfies Readonly<Record<string, SoleRuns>>;

const THREE_QUARTER_RIGHT: PartCut = {
  parts: [
    {
      name: 'head',
      take: [
        box(-1, -1, FAR, 165),
        box(95, 165, FAR, 173),
        box(150, 173, 185, 179),
        box(10, 165, 44, 201),
      ],
    },
    {
      name: 'armRight',
      take: [...tqrRight.take, { disc: { c: [34, 369], r: 26.5 } }],
      unless: tqrRight.unless,
      pivot: JOINTS.threeQuarterRight.shoulderRight,
    },
    {
      name: 'armLeft',
      take: [...tqrLeft.take, { disc: { c: [205.5, 368], r: 23 } }],
      unless: tqrLeft.unless,
      pivot: JOINTS.threeQuarterRight.shoulderLeft,
    },
    {
      name: 'footRight',
      take: [{ polygon: [[10, 511], ...TQR_HEM.right, [115, 524], [115, 580], [10, 580]] }],
      unless: [underSole(TQR_SOLES.right)],
    },
    {
      name: 'footLeft',
      take: [{ polygon: [[115, 524], ...TQR_HEM.left, [215, 508], [215, 580], [115, 580]] }],
      unless: [underSole(TQR_SOLES.left)],
    },
    {
      name: 'shadow',
      role: 'shadow',
      take: [
        {
          polygon: [
            [-1, 511],
            ...TQR_HEM.right,
            ...TQR_HEM.left,
            [FAR, 508],
            [FAR, FAR],
            [-1, FAR],
          ],
        },
      ],
    },
    { name: 'robe', take: [box(-1, 330, FAR, FAR)], unless: [box(160, 322, 200, 420)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
};

const P1_HEM = {
  right: [
    [153, 571],
    [173, 521],
    [192, 552],
    [221, 561],
    [233, 557],
  ],
  left: [
    [277, 558],
    [289, 567],
    [321, 567],
    [325, 561],
    [342, 552],
    [361, 542],
    [367, 540],
    [397, 522],
  ],
} as const;
const P1_LEFT: Sleeve = {
  inner: [
    [300, 190],
    [300.5, 235],
    [301.5, 250],
    [304.5, 265],
    [307.5, 280],
    [311.5, 295],
    [313.5, 310],
    [315.5, 325],
    [316.5, 335],
    [309.5, 346],
  ],
  shoulder: JOINTS['poses-1'].shoulderLeft,
  cap: 12,
  side: 'right',
};
const p1Left = sleeve(P1_LEFT);
const P1_SOLES = {
  right: [
    [142, 163, 584],
    [164, 189, 585],
    [190, 233, 584],
  ],
  left: [
    [278, 303, 584],
    [304, 310, 585],
    [311, 339, 584],
    [340, 360, 582],
  ],
} as const satisfies Readonly<Record<string, SoleRuns>>;
const P1_SEEDS = [
  box(17, 288, 31, 311),
  box(47, 308, 62, 330),
  box(-1, 326, 9, 349),
  box(31, 348, 46, 371),
  box(68, 366, 85, 386),
  box(12, 389, 27, 411),
  box(57, 407, 75, 428),
  box(44, 448, 61, 468),
  box(94, 451, 114, 470),
  box(91, 493, 112, 512),
];

const POSES_1: PartCut = {
  parts: [
    {
      name: 'head',
      take: [
        box(-1, -1, FAR, 160),
        box(186, 160, FAR, 170),
        box(186, 170, 311, 184),
        box(308, 145, 360, 191),
      ],
    },
    {
      name: 'armLeft',
      take: [...p1Left.take, { disc: { c: [360.5, 361], r: 32 } }],
      unless: p1Left.unless,
      pivot: JOINTS['poses-1'].shoulderLeft,
    },
    { name: 'seed', take: P1_SEEDS },
    {
      name: 'armRight',
      take: [
        {
          polygon: [
            [-1, 170],
            [178, 170],
            [178, 253],
            [162, 259],
            [150, 262],
            [138, 265],
            [125, 268],
            [110, 271],
            [60, 274],
            [-1, 274],
          ],
        },
      ],
      pivot: JOINTS['poses-1'].shoulderRight,
    },
    {
      name: 'footRight',
      take: [{ polygon: [[130, 571], ...P1_HEM.right, [255, 557], [255, 620], [130, 620]] }],
      unless: [underSole(P1_SOLES.right)],
    },
    {
      name: 'footLeft',
      take: [{ polygon: [[255, 557], ...P1_HEM.left, [FAR, 522], [FAR, 620], [255, 620]] }],
      unless: [underSole(P1_SOLES.left)],
    },
    {
      name: 'shadow',
      role: 'shadow',
      take: [
        {
          polygon: [[-1, 571], ...P1_HEM.right, ...P1_HEM.left, [FAR, 522], [FAR, FAR], [-1, FAR]],
        },
      ],
    },
    { name: 'robe', take: [box(-1, 330, FAR, FAR)], unless: [box(249, 330, 374, 453)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
};

const P2_HEM = {
  left: [
    [48, 540],
    [56, 547],
    [64, 552],
    [72, 554],
    [88, 556],
    [100, 557],
    [120, 557],
  ],
  right: [
    [147, 557],
    [176, 557],
    [200, 557],
    [216, 554],
    [224, 553],
    [232, 552],
    [241, 540],
  ],
} as const;
const P2_RIGHT: Sleeve = {
  inner: [
    [222, 200],
    [222, 270],
    [223.5, 310],
    [226.5, 345],
    [227.5, 356],
  ],
  shoulder: JOINTS['poses-2'].shoulderRight,
  cap: 26,
  side: 'right',
};
const P2_LEFT: Sleeve = {
  inner: [
    [77, 200],
    [77, 270],
    [76, 285],
    [75, 300],
    [74, 315],
    [73, 330],
    [72, 340],
    [71, 348],
  ],
  shoulder: JOINTS['poses-2'].shoulderLeft,
  cap: 24,
  side: 'left',
};
const p2Right = sleeve(P2_RIGHT);
const p2Left = sleeve(P2_LEFT);
const P2_CORNERS = {
  left: {
    polygon: [
      [-1, 176],
      [62, 176],
      [64, 199],
      [64, 206],
      [-1, 206],
    ],
  },
  right: {
    polygon: [
      [234, 176],
      [FAR, 176],
      [FAR, 206],
      [229, 206],
      [229, 200],
    ],
  },
} as const satisfies Readonly<Record<string, PartRule>>;
const P2_BANDS = {
  left: {
    polygon: [
      [60, 170],
      [76, 170],
      [76, 198],
      [88, 203],
      [88, 215],
      [76, 215],
      [70, 211],
      [65, 201],
      [63, 176],
    ],
  },
  right: {
    polygon: [
      [222, 170],
      [236, 170],
      [234, 176],
      [229, 200],
      [228, 212],
      [212, 214],
      [212, 203],
      [220, 200],
    ],
  },
} as const satisfies Readonly<Record<string, PartRule>>;
const P2_SOLES = {
  left: [
    [75, 75, 578],
    [76, 76, 580],
    [77, 78, 581],
    [79, 81, 582],
    [82, 84, 583],
    [85, 88, 584],
    [89, 92, 585],
    [93, 96, 586],
    [97, 102, 587],
    [103, 133, 588],
    [134, 139, 587],
    [140, 142, 586],
    [143, 144, 585],
    [145, 146, 584],
  ],
  right: [
    [147, 147, 582],
    [148, 148, 581],
    [149, 149, 579],
    [150, 151, 581],
    [152, 153, 582],
    [154, 160, 583],
    [161, 175, 584],
    [176, 185, 585],
    [186, 204, 584],
    [205, 212, 583],
    [213, 218, 582],
    [219, 219, 581],
    [220, 220, 580],
    [221, 221, 579],
    [222, 222, 578],
  ],
} as const satisfies Readonly<Record<string, SoleRuns>>;

const POSES_2: PartCut = {
  parts: [
    {
      name: 'head',
      take: [
        {
          polygon: [
            [-1, -1],
            [FAR, -1],
            [FAR, 170],
            [230, 170],
            [228, 176],
            [223, 200],
            [222, 208],
            [209, 212],
            [200, 222],
            [190, 232],
            [182, 239],
            [173, 238],
            [138, 225],
            [111, 215],
            [88, 205],
            [76, 207],
            [70, 199],
            [68, 176],
            [66, 170],
            [-1, 170],
          ],
        },
      ],
    },
    {
      name: 'armLeft',
      take: [...p2Left.take, { disc: { c: [31, 378], r: 31 } }, P2_CORNERS.left],
      unless: [...p2Left.unless, P2_BANDS.left],
      pivot: JOINTS['poses-2'].shoulderLeft,
    },
    {
      name: 'armRight',
      take: [...p2Right.take, { disc: { c: [263, 378], r: 31 } }, P2_CORNERS.right],
      unless: [...p2Right.unless, P2_BANDS.right],
      pivot: JOINTS['poses-2'].shoulderRight,
    },
    {
      name: 'footLeft',
      take: [{ polygon: [[30, 540], ...P2_HEM.left, [147, 557], [147, 610], [30, 610]] }],
      unless: [underSole(P2_SOLES.left)],
    },
    {
      name: 'footRight',
      take: [{ polygon: [...P2_HEM.right, [260, 540], [260, 610], [147, 610]] }],
      unless: [underSole(P2_SOLES.right)],
    },
    {
      name: 'shadow',
      role: 'shadow',
      take: [
        {
          polygon: [[-1, 540], ...P2_HEM.left, ...P2_HEM.right, [FAR, 540], [FAR, FAR], [-1, FAR]],
        },
      ],
    },
    { name: 'robe', take: [box(-1, 345, FAR, FAR)], unless: [box(32, 331, 135, 456)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
};

const P3_HEM = {
  right: [
    [10, 500],
    [19, 539],
    [20, 569],
    [48, 569],
    [63, 571],
    [69, 571],
    [86, 559],
  ],
  left: [
    [137, 559],
    [149, 570],
    [170, 570],
    [179, 572],
    [198, 572],
    [205, 552],
    [222, 552],
    [230, 545],
  ],
} as const;
const P3_LEFT: Sleeve = {
  inner: [
    [205, 200],
    [204.5, 250],
    [201.5, 260],
    [202.5, 270],
    [202.5, 290],
    [203.5, 310],
    [204.5, 325],
    [208.5, 345],
  ],
  shoulder: JOINTS['poses-3'].shoulderLeft,
  cap: 12,
  side: 'right',
};
const p3Left = sleeve(P3_LEFT);
const P3_BAND: PartRule = {
  polygon: [
    [180, 184],
    [FAR, 184],
    [FAR, 202],
    [196, 202],
    [180, 192],
  ],
};
const P3_SOLES = {
  right: [
    [0, 16, 582],
    [17, 55, 584],
    [56, 85, 582],
  ],
  left: [
    [138, 150, 578],
    [151, 168, 582],
    [169, 216, 584],
    [217, 226, 580],
  ],
} as const satisfies Readonly<Record<string, SoleRuns>>;

const POSES_3: PartCut = {
  parts: [
    {
      name: 'head',
      take: [
        {
          polygon: [
            [-1, -1],
            [FAR, -1],
            [FAR, 184],
            [140, 184],
            [128, 178],
            [115, 183],
            [104, 189],
            [98, 189],
            [84, 182],
            [71, 177],
            [64, 166],
            [-1, 166],
          ],
        },
      ],
    },
    {
      name: 'armLeft',
      take: [...p3Left.take, box(212, 345, FAR, 358), { disc: { c: [241, 380], r: 32 } }],
      unless: [...p3Left.unless, P3_BAND],
      pivot: JOINTS['poses-3'].shoulderLeft,
    },
    {
      name: 'armRight',
      take: [
        {
          polygon: [
            [-1, 174],
            [48, 174],
            [50, 180],
            [57, 195],
            [63, 213],
            [66, 228],
            [69, 240],
            [72, 252],
            [78, 261],
            [90, 262],
            [101, 265],
            [109, 270],
            [117, 275],
            [132, 280],
            [135, 285],
            [139, 290],
            [147, 295],
            [157, 299],
            [164, 301],
            [170, 304],
            [170, 353],
            [110, 353],
            [104, 357],
            [99, 364],
            [85, 363],
            [76, 357],
            [68, 352],
            [61, 347],
            [54, 342],
            [48, 337],
            [42, 332],
            [36, 327],
            [31, 322],
            [21, 317],
            [-1, 317],
          ],
        },
      ],
      pivot: JOINTS['poses-3'].shoulderRight,
    },
    {
      name: 'footRight',
      take: [{ polygon: [[-1, 500], ...P3_HEM.right, [112, 559], [112, 620], [-1, 620]] }],
      unless: [underSole(P3_SOLES.right)],
    },
    {
      name: 'footLeft',
      take: [{ polygon: [[112, 559], ...P3_HEM.left, [FAR, 545], [FAR, 620], [112, 620]] }],
      unless: [underSole(P3_SOLES.left)],
    },
    {
      name: 'shadow',
      role: 'shadow',
      take: [
        {
          polygon: [[-1, 500], ...P3_HEM.right, ...P3_HEM.left, [FAR, 545], [FAR, FAR], [-1, FAR]],
        },
      ],
    },
    { name: 'robe', take: [box(-1, 335, FAR, FAR)], unless: [box(110, 340, 232, 456)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
};

const P4_RIGHT: Sleeve = {
  inner: [
    [73, 185],
    [73, 310],
    [71.5, 325],
    [70.5, 340],
    [69, 350],
    [68.5, 360],
    [67.5, 375],
    [64, 390],
    [62.5, 397],
    [58, 403],
  ],
  shoulder: JOINTS['poses-4'].shoulderRight,
  cap: 24,
  side: 'left',
};
const P4_LEFT: Sleeve = {
  inner: [
    [232.5, 185],
    [232.5, 270],
    [233.5, 280],
    [235.5, 300],
    [236.5, 320],
    [238.5, 340],
    [239.5, 350],
    [236, 358],
    [234, 364],
    [246, 366],
    [246.5, 380],
    [249, 392],
    [252, 398],
    [256, 404],
  ],
  shoulder: JOINTS['poses-4'].shoulderLeft,
  cap: 27,
  side: 'right',
};
const p4Right = sleeve(P4_RIGHT);
const p4Left = sleeve(P4_LEFT);
const P4_BANDS = {
  right: {
    polygon: [
      [-1, 170],
      [118, 170],
      [113, 175],
      [98, 180],
      [90, 185],
      [82, 190],
      [76, 195],
      [71, 199],
      [52, 200],
      [-1, 200],
    ],
  },
  left: {
    polygon: [
      [190, 170],
      [FAR, 170],
      [FAR, 200],
      [258, 200],
      [245, 198],
      [240, 195],
      [232, 190],
      [223, 185],
      [215, 180],
      [205, 175],
      [195, 171],
    ],
  },
} as const satisfies Readonly<Record<string, PartRule>>;
const P4_HEM = {
  right: [
    [62, 535],
    [64, 574],
    [97, 574],
    [104, 570],
    [113, 570],
    [120, 561],
  ],
  left: [
    [180, 561],
    [188, 570],
    [203, 570],
    [210, 566],
    [217, 570],
    [229, 570],
    [240, 560],
    [247, 535],
  ],
} as const;
const P4_SOLES = {
  right: [
    [47, 50, 580],
    [51, 55, 582],
    [56, 62, 584],
    [63, 67, 585],
    [68, 87, 586],
    [88, 100, 585],
    [101, 115, 584],
    [116, 125, 582],
    [126, 131, 580],
  ],
  left: [
    [179, 185, 580],
    [186, 195, 582],
    [196, 210, 584],
    [211, 223, 585],
    [224, 241, 586],
    [242, 250, 585],
    [251, 256, 583],
    [257, 262, 580],
  ],
} as const satisfies Readonly<Record<string, SoleRuns>>;

const POSES_4: PartCut = {
  parts: [
    { name: 'head', take: [box(-1, -1, FAR, 170), box(118, 170, 194, 184)] },
    {
      name: 'armLeft',
      take: [...p4Left.take, { disc: { c: [278, 381], r: 29 } }],
      unless: [...p4Left.unless, P4_BANDS.left],
      pivot: JOINTS['poses-4'].shoulderLeft,
    },
    {
      name: 'armRight',
      take: [...p4Right.take, { disc: { c: [33, 379], r: 30 } }],
      unless: [...p4Right.unless, P4_BANDS.right],
      pivot: JOINTS['poses-4'].shoulderRight,
    },
    {
      name: 'footLeft',
      take: [{ polygon: [[155, 561], ...P4_HEM.left, [280, 535], [280, 620], [155, 620]] }],
      unless: [underSole(P4_SOLES.left)],
    },
    {
      name: 'footRight',
      take: [{ polygon: [[30, 535], ...P4_HEM.right, [155, 561], [155, 620], [30, 620]] }],
      unless: [underSole(P4_SOLES.right)],
    },
    {
      name: 'shadow',
      role: 'shadow',
      take: [
        {
          polygon: [[-1, 535], ...P4_HEM.right, ...P4_HEM.left, [FAR, 535], [FAR, FAR], [-1, FAR]],
        },
      ],
    },
    { name: 'robe', take: [box(-1, 335, FAR, FAR)], unless: [box(168, 335, 276, 458)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
};

const INK = [34, 16, 8, 255] as const;

const SIDES = sides({ pronoun: 'his', lower: 'robe', cloth: 'the linen tunic and olive mantle' });

const GRAIN = grain('the linen tunic and olive mantle of his body');

const HIDDEN_ENTRIES = {
  front: {
    moving: ['armRight', 'armLeft'],
    prompt: `${CUT_AWAY} his two arms (sleeves and round hands) were cut away to make a cut-out puppet. Repaint ONLY the magenta areas, as what lies underneath his arms: the sides of his body, from each armpit down to the robe, each side closed by the same thick dark brown-black outline as the rest of him, painted in exactly the same style, colours and soft shading as his body beside each arm (the linen tunic, the olive mantle with its walnut-brown edge band, the belt round his waist). ${SIDES} ${shade('his')} ${GRAIN} There are no arms now: no sleeves, no hands, nothing magenta left. Where the magenta lay outside his body, it becomes the plain cream paper. Keep every other pixel exactly as it is: the same head, headcloth, face, beard, tunic, mantle, walnut strap, belt, walnut seed bag, feet, size, position and framing.`,
  },
  threeQuarterLeft: {
    moving: ['armRight', 'armLeft'],
    prompt: `${CUT_AWAY} his two arms (sleeves and round hands) were cut away to make a cut-out puppet. He is turned three-quarters to the viewer's left. Repaint ONLY the magenta areas, as what lies underneath his arms: the sides of his body, from each armpit down to the robe, each side closed by the same thick dark brown-black outline as the rest of him, painted in exactly the same style, colours and soft shading as his body beside each arm (the olive mantle with its walnut-brown edge band on the viewer's left side, the olive mantle and the walnut seed bag on the viewer's right side, the linen tunic, the belt round his waist). ${SIDES} ${shade('his')} ${GRAIN} There are no arms now: no sleeves, no hands, nothing magenta left. Where the magenta lay outside his body, it becomes the plain cream paper. Keep every other pixel exactly as it is: the same head, headcloth and its tail, face, beard, tunic, mantle, walnut strap, belt, walnut seed bag, feet, size, position and framing.`,
  },
  back: {
    moving: ['armRight', 'armLeft'],
    prompt: `${CUT_AWAY} his two arms (sleeves and round hands) were cut away to make a cut-out puppet. He is seen from behind. Repaint ONLY the magenta areas, as what lies underneath his arms: the sides of his body, from each armpit down to the robe, each side closed by the same thick dark brown-black outline as the rest of him, painted in exactly the same style, colours and soft shading as his body beside each arm (the olive mantle over his back, the walnut seed bag on the viewer's left side, the linen tunic below the mantle). ${SIDES} ${shade('his')} ${GRAIN} There are no arms now: no sleeves, no hands, nothing magenta left. Where the magenta lay outside his body, it becomes the plain cream paper. Keep every other pixel exactly as it is: the same headcloth, mantle, walnut strap, walnut seed bag, tunic, feet, size, position and framing.`,
  },
  profileLeft: {
    moving: ['armLeft'],
    prompt: `${CUT_AWAY} his left arm (its sleeve and round hand) was cut away to make a cut-out puppet. He is seen in profile, facing the viewer's left, and his other arm does not show. Repaint ONLY the magenta areas, as what lies underneath his arm: the side of his body from the armpit down to the robe, painted in exactly the same style, colours and soft shading as his body round the arm (the olive mantle's front panel before it, the walnut-brown edge band and the olive mantle of his back behind it, the walnut strap, the belt round his waist, the linen tunic, and the walnut seed bag at his hip, now whole where the hand lay over it). ${SIDES} ${shade('his')} ${GRAIN} There is no arm now: no sleeve, no hand, nothing magenta left. Where the magenta lay outside his body, it becomes the plain cream paper. Keep every other pixel exactly as it is: the same head, headcloth and its tail, face, beard, tunic, mantle, walnut strap, belt, walnut seed bag, feet, size, position and framing.`,
  },
  profileRight: {
    moving: ['armRight'],
    prompt: `${CUT_AWAY} his right arm (its sleeve and round hand) was cut away to make a cut-out puppet. He is seen in profile, facing the viewer's right, and his other arm does not show. Repaint ONLY the magenta areas, as what lies underneath his arm: the side of his body from the armpit down to the robe, painted in exactly the same style, colours and soft shading as his body round the arm (his back's outline and the walnut-brown edge band of the olive mantle behind it, the olive mantle over his side, its front panel and the walnut strap before it, the belt round his waist, the linen tunic below). No seed bag shows on this side: paint none. ${SIDES} ${shade('his')} ${GRAIN} There is no arm now: no sleeve, no hand, nothing magenta left. Where the magenta lay outside his body, it becomes the plain cream paper. Keep every other pixel exactly as it is: the same head, headcloth and its tail, face, beard, tunic, mantle, walnut strap, belt, feet, size, position and framing.`,
  },
  threeQuarterRight: {
    moving: ['armRight', 'armLeft'],
    prompt: `${CUT_AWAY} his two arms (sleeves and round hands) were cut away to make a cut-out puppet. He is turned three-quarters to the viewer's right. Repaint ONLY the magenta areas, as what lies underneath his arms: the sides of his body, from each armpit down to the robe, each side closed by the same thick dark brown-black outline as the rest of him, painted in exactly the same style, colours and soft shading as his body beside each arm (his back's outline and the olive mantle with its walnut-brown edge band on the viewer's left side, the olive mantle and the walnut seed bag at his hip on the viewer's right side, the linen tunic, the belt round his waist). ${SIDES} ${shade('his')} ${GRAIN} There are no arms now: no sleeves, no hands, nothing magenta left. Where the magenta lay outside his body, it becomes the plain cream paper. Keep every other pixel exactly as it is: the same head, headcloth and its tail, face, beard, tunic, mantle, walnut strap, belt, walnut seed bag, feet, size, position and framing.`,
  },
  'poses-1': {
    moving: ['armRight', 'armLeft'],
    prompt: `${CUT_AWAY} his two arms (sleeves and round hands) were cut away to make a cut-out puppet. He is turned three-quarters to the viewer's left, striding and scattering seed: his right arm was flung out level towards the viewer's left, over the plain paper, and his left arm hung at his side with its hand on the seed bag. Repaint ONLY the magenta areas, as what lies underneath his arms: the sides of his body, from each armpit down to the robe, each side closed by the same thick dark brown-black outline as the rest of him, painted in exactly the same style, colours and soft shading as his body beside each arm (the olive mantle and his body's front outline on the viewer's left side; the olive mantle, the walnut strap, the belt round his waist and the walnut seed bag at his hip on the viewer's right side, the bag now whole where the hand lay over it). ${SIDES} ${shade('his')} ${GRAIN} There are no arms now: no sleeves, no hands, nothing magenta left. Where the magenta lay outside his body, it becomes the plain cream paper. Keep every other pixel exactly as it is: the same head, headcloth and its tail, face, beard, tunic, mantle, walnut strap, belt, walnut seed bag, the falling seeds, feet, size, position and framing.`,
  },
  'poses-2': {
    moving: ['armRight', 'armLeft'],
    prompt: `${CUT_AWAY} his two arms (sleeves and round hands) were cut away to make a cut-out puppet. He is seen from behind, standing, and the headcloth hangs as a cape over his shoulders to a point. Repaint ONLY the magenta areas, as what lies underneath his arms: the sides of his body, from each armpit under the cape down to the robe, each side closed by the same thick dark brown-black outline as the rest of him, painted in exactly the same style, colours and soft shading as his body beside each arm (the olive mantle over his back, the walnut seed bag on the viewer's left side, now whole where the hand lay over it, the linen tunic below the mantle). ${SIDES} ${shade('his')} ${GRAIN} There are no arms now: no sleeves, no hands, nothing magenta left. Where the magenta lay outside his body, it becomes the plain cream paper. Keep every other pixel exactly as it is: the same headcloth and its cape, mantle, walnut strap, walnut seed bag, tunic, feet, size, position and framing.`,
    allowance: {
      calls: 3,
      by: 'orchestrator',
      on: '2026-10-29',
      why: "its three calls were drawn on cuts where head bordered the sleeves' caps, so okra's paint beside the cape fell to head; the cut now parts them with a torso band (P2_BANDS), and that cut had never been asked",
    },
  },
  'poses-3': {
    moving: ['armRight', 'armLeft'],
    prompt: `${CUT_AWAY} his two arms (sleeves and round hands) were cut away to make a cut-out puppet. He is turned three-quarters to the viewer's left, reaching into his seed bag: his right arm was bent across his body, its sleeve down his front and its forearm and hand reaching across his chest into the mouth of the seed bag, and his left arm hung at his side beside the bag. Repaint ONLY the magenta areas, as what lies underneath his arms: on the viewer's left, his body's front outline from under the headcloth down to the robe, and across his chest the olive mantle, the walnut strap running down from his shoulder to the bag, the linen tunic, and the top of the walnut seed bag, now whole where the hand lay in its mouth; on the viewer's right, the side of his body from the armpit down to the robe, closed by the same thick dark brown-black outline as the rest of him, the olive mantle and the walnut seed bag's right edge, now whole where the hand lay beside it. Paint each in exactly the same style, colours and soft shading as his body beside the arms. ${SIDES} ${shade('his')} ${GRAIN} There are no arms now: no sleeves, no hands, nothing magenta left. Where the magenta lay outside his body, it becomes the plain cream paper. Keep every other pixel exactly as it is: the same head, headcloth and its tail, face, beard, tunic, mantle, walnut strap, belt, walnut seed bag, feet, size, position and framing.`,
  },
  'poses-4': {
    moving: ['armRight', 'armLeft'],
    prompt: `${CUT_AWAY} his two arms (sleeves and round hands) were cut away to make a cut-out puppet. He stands facing the viewer, his arms hanging at his sides: his left arm (on the viewer's right) hung beside the walnut seed bag on his left hip, its hand over the bag's top right. Repaint ONLY the magenta areas, as what lies underneath his arms: the sides of his body, from each armpit down to the robe, each side closed by the same thick dark brown-black outline as the rest of him, painted in exactly the same style, colours and soft shading as his body beside each arm (the linen tunic, the olive mantle with its walnut-brown edge band, the belt round his waist), and on the viewer's right the walnut seed bag's top and right edge, now whole where the hand lay over it. ${SIDES} ${shade('his')} ${GRAIN} There are no arms now: no sleeves, no hands, nothing magenta left. Where the magenta lay outside his body, it becomes the plain cream paper. Keep every other pixel exactly as it is: the same head, headcloth and its tails over his shoulders, face, beard, tunic, mantle, walnut strap, belt, walnut seed bag, feet, size, position and framing.`,
  },
} as const satisfies Readonly<Record<CutView, HiddenEntry>>;

const FEET = 'the ground between his feet';

export const { CUTS, cutOptionsFor, HIDDEN, GAPS, paperOf } = cutTable({
  frames: FRAMES,
  views: {
    front: {
      cut: FRONT,
      figure: 'framed',
      gaps: [{ at: [125, 533], box: [107, 525, 145, 543], why: FEET }],
    },
    threeQuarterLeft: {
      cut: THREE_QUARTER_LEFT,
      figure: 'framed',
      gaps: [{ at: [114, 534], box: [96, 526, 133, 543], why: FEET }],
    },
    back: {
      cut: BACK,
      figure: 'framed',
      gaps: [{ at: [127, 534], box: [109, 526, 147, 544], why: FEET }],
    },
    profileLeft: { cut: PROFILE_LEFT, figure: 'framed' },
    profileRight: { cut: PROFILE_RIGHT, figure: 'framed' },
    threeQuarterRight: {
      cut: THREE_QUARTER_RIGHT,
      figure: 'framed',
      gaps: [{ at: [113, 534], box: [97, 526, 130, 543], why: FEET }],
    },
    'poses-1': {
      cut: POSES_1,
      figure: 'framed',
      gaps: [{ at: [257, 563], box: [233, 559, 283, 568], why: FEET }],
    },
    'poses-2': { cut: POSES_2, figure: 'framed' },
    'poses-3': { cut: POSES_3, figure: 'framed' },
    'poses-4': { cut: POSES_4, figure: 'framed' },
  },
  hidden: HIDDEN_ENTRIES,
  ink: INK,
});

const RIM_BAND = 64;

const RIM_NEAR = 12;

export const PAPER_RIMS = Records.map(
  { ...TURNAROUND_PAPERS, ...POSES_PAPERS },
  (paper): PaperRim => ({ paper, band: RIM_BAND, near: RIM_NEAR }),
);

export const CLEAN = Records.map(PAPER_RIMS, clearPaperRim) satisfies Partial<
  Record<keyof typeof CUTS, SheetClean>
>;
