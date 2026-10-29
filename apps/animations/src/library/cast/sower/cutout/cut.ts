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

/**
 * From three-quarters, turned to the viewer's left: his right arm is the near
 * one, his left (the far one) holds the seed bag. The hem's line, column by
 * column from the sheet's left edge: the tunic's side, the hem over his right
 * sandal, the hem between his feet, over his left sandal, the tunic's side.
 * His sandals take what lies under it in their columns, the shadow the rest.
 */
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
  // his right sleeve (the viewer's left, the near one): its inner edge, the linen-to-olive crease
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
  // his left sleeve (the viewer's right, the far one): its inner edge, an olive-to-linen crease; the seed bag's right ink lies on it below his belt
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
  // 8, not the near sleeve's 12: a wider cap borders the headcloth's tail, so the paint under it would fall to the head, which lies in front of this arm
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
    // above the chin, and the headcloth's tail that hangs over his left sleeve's top
    { name: 'head', take: [box(-1, -1, FAR, 169), box(187, 150, 213, 205)] },
    {
      name: 'armLeft',
      // the disc stops at the seed bag's walnut edge, left of the hand and under it
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
      take: [
        {
          polygon: [
            [-1, 509],
            ...TQL_HEM.right,
            ...TQL_HEM.left,
            [FAR, 512],
            [FAR, FAR * 2],
            [-1, FAR * 2],
          ],
        },
      ],
    },
    // below the belt, but the seed bag
    { name: 'robe', take: [box(-1, 330, FAR, FAR * 2)], unless: [box(132, 304, 202, 418)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR * 2)] },
  ],
};

/**
 * The back view, the parts named from his own side: from behind, his right
 * arm hangs on the viewer's right and his left on the viewer's left, its hand
 * over the seed bag. The headcloth hangs over his neck and both sleeves' tops;
 * the olive mantle covers his back. The hem's line, column by column from the
 * sheet's left edge: the tunic's side, the hem over his left sandal, between
 * his feet, over his right sandal, the tunic's side.
 */
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
  // his right sleeve (the viewer's right): its inner edge, the olive-to-linen crease, to the cuff
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
  // his left sleeve (the viewer's left): its inner edge, the linen-to-olive crease; the seed bag's left ink lies beside it below y 318
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
    // the headcloth, above its bottom ink, which lies over both sleeves' tops and the strap's
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
      // the disc reaches the ring's right ink, which it shares with the seed bag's left edge
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
      take: [
        {
          polygon: [
            [-1, 510],
            ...BACK_HEM.left,
            ...BACK_HEM.right,
            [FAR, 510],
            [FAR, FAR * 2],
            [-1, FAR * 2],
          ],
        },
      ],
    },
    // below his hip's row, as in the front, but the seed bag
    { name: 'robe', take: [box(-1, 331, FAR, FAR * 2)], unless: [box(32, 316, 112, 427)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR * 2)] },
  ],
};

/**
 * In profile to the viewer's left: only his left arm shows, the near one,
 * over his body's side, with the body on both sides of it (the mantle's front
 * panel before its front edge, the mantle's edge band and his back behind its
 * back edge). The hem's line, column by column from the sheet's left edge:
 * the tunic's front side, the hem over his leading sandal, the hem between
 * his feet, over his trailing sandal, the tunic's back side. Which sandal is
 * his left is read from the turn: the near, leading one.
 */
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
  // his left sleeve's back edge: the ink it shares with the headcloth's tail, then a linen-to-walnut crease, then thin ink down to the cuff's slant
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
/** Before the sleeve's front edge: the mantle's front panel, his belt and his body's front, down past the cuff. */
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
      // the hand's disc stops at its right ink, which lies on the seed bag
      take: [...plLeft.take, { disc: { c: [92.5, 369], r: 26 } }],
      unless: [...plLeft.unless, PL_FRONT],
      pivot: JOINTS.profileLeft.shoulderLeft,
    },
    // above the chin, and the headcloth's tail that hangs behind his left sleeve's top
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
      take: [
        {
          polygon: [
            [-1, 510],
            ...PL_HEM.left,
            ...PL_HEM.right,
            [FAR, 512],
            [FAR, FAR * 2],
            [-1, FAR * 2],
          ],
        },
      ],
    },
    // below the belt, but the seed bag
    { name: 'robe', take: [box(-1, 330, FAR, FAR * 2)], unless: [box(78, 328, 165, 428)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR * 2)] },
  ],
};

/**
 * In profile to the viewer's right: only his right arm shows, the near one,
 * over his body's side, with the body on both sides of it (his back and the
 * headcloth's tail behind its back edge, the mantle's front panel and the
 * strap before its front edge). The hem's line, column by column from the
 * sheet's left edge: the tunic's back side, the hem over his trailing sandal,
 * between his feet, over his leading sandal, the tunic's front side. Which
 * sandal is his right is read from the turn: the near, leading one.
 */
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
  // his right sleeve's back edge, at its ink's outer side: from the shoulder's curve down the ink beside the headcloth's tail, then where it meets his back's outline, in to the cuff and down round its ink, whose lower corner runs to y356
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
/** Past the sleeve's front edge (its shoulder ink, then the crease, then the cuff's ink): the strap, the mantle's front panel, his belt and his body's front, down past the cuff. */
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
      // the hand's disc takes its whole ink ring (x47-102, y345-394)
      take: [...prRight.take, { disc: { c: [74.5, 369], r: 28 } }],
      unless: [...prRight.unless, PR_FRONT],
      pivot: JOINTS.profileRight.shoulderRight,
    },
    // above the chin, and the headcloth's tail that hangs behind his right sleeve's top
    { name: 'head', take: [box(-1, -1, FAR, 169), box(-1, 150, 40, 233)] },
    {
      name: 'footRight',
      take: [{ polygon: [...PR_HEM.right, [165, 513], [165, 575], [102, 575]] }],
      unless: [underSole(PR_SOLES.right)],
    },
    {
      name: 'footLeft',
      // the tunic's back side (x13-26) has no sandal under it
      take: [{ polygon: [[27, 517], ...PR_HEM.left, [102, 532], [102, 575], [27, 575]] }],
      unless: [underSole(PR_SOLES.left)],
    },
    {
      name: 'shadow',
      take: [
        {
          polygon: [
            [-1, 509],
            ...PR_HEM.back,
            ...PR_HEM.left,
            ...PR_HEM.right,
            [FAR, 513],
            [FAR, FAR * 2],
            [-1, FAR * 2],
          ],
        },
      ],
    },
    // below the belt; the seed bag hangs on his far hip and does not show
    { name: 'robe', take: [box(-1, 331, FAR, FAR * 2)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR * 2)] },
  ],
};

/**
 * From three-quarters, turned to the viewer's right: his right arm is the near
 * one, on the viewer's left, with the headcloth's tail over its shoulder; his
 * left arm, the far one, hangs on the viewer's right with the seed bag mostly
 * behind it. The hem's line, column by column from the sheet's left edge: the
 * tunic's side, the hem over his right sandal, between his feet, over his left
 * sandal, the tunic's side.
 */
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
  // his right sleeve (the viewer's left, the near one): its inner edge, the linen-to-dark-olive crease, then the cuff's ink
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
  // his left sleeve (the viewer's right, the far one): its inner edge, a dark-olive-to-linen crease, then the cuff's ink
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
    // above the chin (the face's lower edge, then the beard's at its front), and the headcloth's tail that hangs over his right sleeve's top, down to its bottom ink
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
      // the hand's disc takes its whole ink ring (x7-61, y345-393)
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
      take: [
        {
          polygon: [
            [-1, 511],
            ...TQR_HEM.right,
            ...TQR_HEM.left,
            [FAR, 508],
            [FAR, FAR * 2],
            [-1, FAR * 2],
          ],
        },
      ],
    },
    // below the belt, but the seed bag on his far hip
    { name: 'robe', take: [box(-1, 330, FAR, FAR * 2)], unless: [box(160, 322, 200, 420)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR * 2)] },
  ],
};

/**
 * His kept pose scattering seed (poses-1, on his kept poses sheet), turned
 * three-quarters to the viewer's left, cut as drawn. His right arm (the far
 * one, on the viewer's left) is flung out level: its sleeve, cuff and round
 * hand fill the band from above its top ink to below its lower ink, out to
 * the sheet's left edge, its root on his body's front outline. His left arm
 * (the near one) hangs, its hand over the seed bag; its inner edge is the
 * sleeve's inner ink, a crease above it. The ten seeds falling from his far
 * hand stand free on the paper, one part. The hem's line, column by column:
 * the robe's front lifting over his leading foot, the hem over it, between
 * his feet, over his trailing foot, the robe's back. His leading foot (the
 * viewer's left) is taken as his right, the trailing one as his left. This
 * sheet's outline ink is [48, 30, 15] (measured); a framed view's cut reads
 * none, so `INK` below stays the turnaround's. The view is 398 px wide, so its right edges
 * run to twice `FAR`, past its pad.
 */
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
  // his left sleeve (the viewer's right, the near one): a crease above its inner ink, then the ink's left edge down to the cuff
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
/** The ten seeds' boxes (measured), each padded 2 px. */
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
    // above the sleeve's top ink; the face and beard over its root, down to the beard's lower ink; the headcloth's tail over his left sleeve's top
    {
      name: 'head',
      take: [box(-1, -1, FAR * 2, 170), box(178, 170, 311, 184), box(308, 145, 360, 191)],
    },
    {
      name: 'armLeft',
      // the hand's disc takes its whole ink ring (x329-392, y337-392)
      take: [...p1Left.take, { disc: { c: [360.5, 361], r: 32 } }],
      unless: p1Left.unless,
      pivot: JOINTS['poses-1'].shoulderLeft,
    },
    { name: 'seed', take: P1_SEEDS },
    {
      name: 'armRight',
      // above its top ink, along its lower ink (3 px under the knots, past the ink) out past the cuff, its root on his body's front outline; the hand ring (x0-63, y184-247) lies inside
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
      take: [{ polygon: [[255, 557], ...P1_HEM.left, [FAR * 2, 522], [FAR * 2, 620], [255, 620]] }],
      unless: [underSole(P1_SOLES.left)],
    },
    {
      name: 'shadow',
      take: [
        {
          polygon: [
            [-1, 571],
            ...P1_HEM.right,
            ...P1_HEM.left,
            [FAR * 2, 522],
            [FAR * 2, FAR * 2],
            [-1, FAR * 2],
          ],
        },
      ],
    },
    // below the belt, but the seed bag on his near hip
    { name: 'robe', take: [box(-1, 330, FAR * 2, FAR * 2)], unless: [box(249, 330, 374, 453)] },
    { name: 'torso', take: [box(-1, -1, FAR * 2, FAR * 2)] },
  ],
};

/** His outline's ink: the median of his views' dark pixels (measured on the three-quarter and back views). */
const INK = [34, 16, 8, 255] as const;

/** Where his body's sides run under his arms: out to his shoulders and robe, not in at the sleeves' inner edges. */
const SIDES = sides({ pronoun: 'his', lower: 'robe', cloth: 'the linen tunic and olive mantle' });

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
} as const satisfies Readonly<Record<CutView, HiddenEntry>>;

/** His cut table: each view's cut and how its figure is read. */
export const { CUTS, cutOptionsFor, HIDDEN } = cutTable({
  frames: FRAMES,
  views: {
    front: { cut: FRONT, figure: 'framed' },
    threeQuarterLeft: { cut: THREE_QUARTER_LEFT, figure: 'framed' },
    back: { cut: BACK, figure: 'framed' },
    profileLeft: { cut: PROFILE_LEFT, figure: 'framed' },
    profileRight: { cut: PROFILE_RIGHT, figure: 'framed' },
    threeQuarterRight: { cut: THREE_QUARTER_RIGHT, figure: 'framed' },
    'poses-1': { cut: POSES_1, figure: 'framed' },
  },
  hidden: HIDDEN_ENTRIES,
  ink: INK,
});
