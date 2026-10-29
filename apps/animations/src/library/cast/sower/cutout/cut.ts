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
} as const satisfies Readonly<Record<CutView, HiddenEntry>>;

/** His cut table: each view's cut and how its figure is read. */
export const { CUTS, cutOptionsFor, HIDDEN } = cutTable({
  frames: FRAMES,
  views: {
    front: { cut: FRONT, figure: 'framed' },
    threeQuarterLeft: { cut: THREE_QUARTER_LEFT, figure: 'framed' },
    back: { cut: BACK, figure: 'framed' },
    profileLeft: { cut: PROFILE_LEFT, figure: 'framed' },
  },
  hidden: HIDDEN_ENTRIES,
  ink: INK,
});
