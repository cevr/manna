import type { HiddenEntry, PartCut, SheetClean } from '@manna/film/tools';
import { CUT_AWAY, KEEP_REST, grain, shade, sides } from '../../../cutout/prompts.ts';
import {
  FAR,
  type Hem,
  type Sleeve,
  type SoleRuns,
  aboveHem,
  belowHem,
  box,
  sleeve,
  underSole,
} from '../../../cutout/rules.ts';
import { clearSpecks } from '../../../cutout/clean.ts';
import { cutTable } from '../../../cutout/table.ts';
import { LABELS } from '../rig/labels.ts';
import { CLASSES } from '../rig/trace.ts';
import { FRAMES } from './frames.ts';
import { JOINTS } from './joints.ts';

export { FRAMES, JOINTS };

/** A view of his, by its name in his sheets' views. */
type CutView = keyof typeof FRAMES;

/** From in front: the world-proto round 2 cut's lines. */
const FRONT_HEM: Hem = [618, 123, 4, 90];
const FRONT_RIGHT: Sleeve = {
  inner: [
    [50, 226],
    [50, 228],
    [53, 240],
    [56, 260],
    [58, 300],
    [60, 340],
    [62, 380],
    [63, 408],
    [63, 409],
  ],
  shoulder: JOINTS.front.shoulderRight,
  cap: 13,
  side: 'left',
};
const FRONT_LEFT: Sleeve = {
  inner: [
    [200, 226],
    [199, 240],
    [190, 290],
    [186, 330],
    [189, 400],
    [191.4, 408],
    [191.6, 409],
  ],
  shoulder: JOINTS.front.shoulderLeft,
  cap: 13,
  side: 'right',
};
const frontRight = sleeve(FRONT_RIGHT);
const frontLeft = sleeve(FRONT_LEFT);
const FRONT_SOLES = {
  right: [
    [21, 21, 651],
    [22, 22, 654],
    [23, 23, 656],
    [24, 25, 657],
    [26, 28, 658],
    [29, 33, 659],
    [34, 39, 660],
    [40, 74, 661],
    [75, 82, 660],
    [83, 88, 659],
    [89, 92, 658],
    [93, 97, 657],
    [98, 100, 656],
    [101, 103, 655],
    [104, 104, 654],
    [105, 105, 653],
    [106, 106, 651],
  ],
  left: [
    [137, 137, 651],
    [138, 138, 653],
    [139, 140, 654],
    [141, 142, 655],
    [143, 145, 656],
    [146, 148, 657],
    [149, 152, 658],
    [153, 157, 659],
    [158, 163, 660],
    [164, 171, 661],
    [172, 198, 662],
    [199, 206, 661],
    [207, 212, 660],
    [213, 216, 659],
    [217, 219, 658],
    [220, 220, 657],
    [221, 221, 656],
    [222, 222, 655],
    [223, 223, 653],
  ],
} as const satisfies Readonly<Record<string, SoleRuns>>;

const FRONT: PartCut = {
  parts: [
    {
      name: 'armRight',
      take: [
        ...frontRight.take,
        { label: 'handNear' },
        { disc: { c: [29.5, 429], r: 29 } },
        box(-1, 395, 36, 463),
      ],
      unless: frontRight.unless,
      pivot: JOINTS.front.shoulderRight,
    },
    {
      name: 'armLeft',
      take: [
        ...frontLeft.take,
        { label: 'handFar' },
        { disc: { c: [216.5, 428.5], r: 28.5 } },
        box(211, 395, FAR, 463),
      ],
      unless: frontLeft.unless,
      pivot: JOINTS.front.shoulderLeft,
    },
    {
      name: 'head',
      take: [box(-1, -1, FAR, 192), { label: 'face' }, { label: 'earNear' }, { label: 'earFar' }],
    },
    {
      name: 'sash',
      take: [
        box(-1, 346, FAR, 369),
        { disc: { c: [124, 357], r: 15 } },
        {
          polygon: [
            [101, 366],
            [146, 366],
            [148, 430],
            [152, 470],
            [153, 533],
            [127, 538],
            [124, 498],
            [101, 492],
          ],
        },
      ],
    },
    {
      name: 'footRight',
      take: [
        {
          polygon: [
            [40, 612],
            [100, 612],
            [104, 630],
            [108, 648],
            [107, 664],
            [25, 664],
            [20, 652],
            [26, 636],
            [38, 620],
          ],
        },
      ],
      unless: [aboveHem(...FRONT_HEM), underSole(FRONT_SOLES.right)],
    },
    {
      name: 'footLeft',
      take: [
        {
          polygon: [
            [142, 612],
            [205, 612],
            [212, 622],
            [222, 638],
            [228, 652],
            [225, 664],
            [138, 664],
            [136, 648],
            [140, 630],
          ],
        },
      ],
      unless: [aboveHem(...FRONT_HEM), underSole(FRONT_SOLES.left)],
    },
    { name: 'shadow', role: 'shadow', take: [belowHem(...FRONT_HEM)] },
    { name: 'robe', take: [box(-1, 369, FAR, FAR)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
};

/** Turned three-quarters to the viewer's left: read off 3-4x crops of the view. */
const TURNED_HEM: Hem = [618, 112, 4, 90];
const TURNED_RIGHT: Sleeve = {
  inner: [
    [47, 226],
    [46, 260],
    [44, 300],
    [42, 340],
    [41, 380],
    [40, 408],
    [40, 409],
  ],
  shoulder: JOINTS.threeQuarterLeft.shoulderRight,
  cap: 11,
  side: 'left',
};
const TURNED_LEFT: Sleeve = {
  inner: [
    [153, 226],
    [151, 240],
    [150, 280],
    [149, 330],
    [150, 380],
    [151, 408],
    [151, 409],
  ],
  shoulder: JOINTS.threeQuarterLeft.shoulderLeft,
  cap: 13,
  side: 'right',
};
const turnedRight = sleeve(TURNED_RIGHT);
const turnedLeft = sleeve(TURNED_LEFT);
const TURNED_SOLES = {
  right: [
    [6, 6, 652],
    [7, 7, 654],
    [8, 9, 656],
    [10, 11, 657],
    [12, 16, 658],
    [17, 25, 659],
    [26, 54, 660],
    [55, 67, 659],
    [68, 76, 658],
    [77, 82, 657],
    [83, 88, 656],
    [89, 93, 655],
    [94, 94, 654],
    [95, 95, 653],
    [96, 96, 652],
    [97, 97, 650],
  ],
  left: [
    [120, 120, 655],
    [121, 121, 656],
    [122, 122, 657],
    [123, 124, 658],
    [125, 127, 659],
    [128, 131, 660],
    [132, 138, 661],
    [139, 152, 662],
    [153, 164, 663],
    [165, 178, 662],
    [179, 187, 661],
    [188, 192, 660],
    [193, 196, 659],
    [197, 198, 658],
    [199, 199, 657],
    [200, 200, 656],
    [201, 201, 655],
    [202, 202, 654],
  ],
} as const satisfies Readonly<Record<string, SoleRuns>>;

const THREE_QUARTER_LEFT: PartCut = {
  parts: [
    {
      name: 'armRight',
      take: [
        ...turnedRight.take,
        { label: 'handNear' },
        {
          polygon: [
            [-1, 410],
            [8, 403],
            [20, 401],
            [32, 403],
            [38, 408],
            [41, 416],
            [41, 442],
            [38, 450],
            [32, 455],
            [22, 458],
            [12, 456],
            [4, 450],
            [-1, 444],
          ],
        },
      ],
      unless: turnedRight.unless,
      pivot: JOINTS.threeQuarterLeft.shoulderRight,
    },
    {
      name: 'armLeft',
      take: [
        ...turnedLeft.take,
        { label: 'handFar' },
        { disc: { c: [184, 430], r: 27 } },
        box(151, 405, FAR, 419),
        box(190, 405, FAR, 452),
      ],
      unless: turnedLeft.unless,
      pivot: JOINTS.threeQuarterLeft.shoulderLeft,
    },
    {
      name: 'head',
      take: [box(-1, -1, FAR, 190), { label: 'face' }],
    },
    {
      name: 'sash',
      take: [
        box(-1, 345, FAR, 369),
        { disc: { c: [88.5, 358.5], r: 15 } },
        {
          polygon: [
            [59, 368],
            [110, 368],
            [111, 450],
            [112, 536],
            [81, 538],
            [80, 478],
            [58, 478],
            [57, 420],
          ],
        },
      ],
    },
    {
      name: 'footRight',
      take: [
        {
          polygon: [
            [30, 612],
            [90, 612],
            [95, 630],
            [99, 650],
            [98, 664],
            [8, 664],
            [5, 650],
            [14, 632],
          ],
        },
      ],
      unless: [aboveHem(...TURNED_HEM), underSole(TURNED_SOLES.right)],
    },
    {
      name: 'footLeft',
      take: [
        {
          polygon: [
            [128, 612],
            [185, 612],
            [195, 630],
            [204, 648],
            [204, 664],
            [119, 664],
            [117, 645],
            [124, 628],
          ],
        },
      ],
      unless: [aboveHem(...TURNED_HEM), underSole(TURNED_SOLES.left)],
    },
    { name: 'shadow', role: 'shadow', take: [belowHem(...TURNED_HEM)] },
    { name: 'robe', take: [box(-1, 369, FAR, FAR)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
};

/**
 * His bust facing the viewer (heads-4), read off 4x and 8x crops: his head
 * (hair, face and ears) above the row where his jaw's ink meets his neck's
 * outline, with the dark shadow his chin casts on his neck between those
 * outlines, so the shadow turns with his chin; his neck below it, his
 * collar and garments.
 */
const HEADS_4: PartCut = {
  parts: [
    {
      name: 'head',
      take: [
        {
          polygon: [
            [-1, -1],
            [FAR, -1],
            [FAR, 214],
            [155, 214],
            [155, 233],
            [90, 233],
            [90, 214],
            [-1, 214],
          ],
        },
      ],
      pivot: [120, 232],
    },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
};

/** His left sleeve on his raised-bottle drawing (single-1, the viewer's right, under the mantle): its inner edge, a dark teal crease down to the cuff. */
const SINGLE_1_LEFT: Sleeve = {
  inner: [
    [432, 455],
    [420, 480],
    [418, 560],
    [416, 640],
    [414, 700],
    [418, 740],
    [424, 775],
  ],
  shoulder: JOINTS['single-1'].shoulderLeft,
  cap: 13,
  side: 'right',
};
const single1Left = sleeve(SINGLE_1_LEFT);

/**
 * His raised-bottle drawing (single-1), read off 1-2x crops of the view: his
 * right arm raised with its elbow tucked, the bottle in his hand beside his
 * cheek, a polygon from the bottle's top down the upper arm's soft crease
 * (no ink) to the sleeve's foot; his left arm hanging under the mantle, its
 * sleeve on its dark teal crease and its hand to the hand's foot; his head
 * above his chin and his neck's skin to the collar; the sash's band, knot
 * and ends; the robe below the sash. His robe and sandals stand with the
 * root, so they are one part.
 */
const SINGLE_1: PartCut = {
  parts: [
    {
      name: 'armRight',
      take: [
        {
          polygon: [
            [-1, 190],
            [143, 190],
            [150, 230],
            [150, 422],
            [165, 405],
            [185, 394],
            [212, 382],
            [212, 400],
            [205, 445],
            [201, 500],
            [198, 545],
            [186, 560],
            [160, 585],
            [-1, 590],
          ],
        },
      ],
      pivot: JOINTS['single-1'].shoulderRight,
    },
    {
      name: 'armLeft',
      take: [...single1Left.take, box(425, 770, FAR, 866)],
      unless: single1Left.unless,
      pivot: JOINTS['single-1'].shoulderLeft,
    },
    {
      name: 'head',
      take: [
        box(-1, -1, FAR, 362),
        {
          polygon: [
            [255, 362],
            [372, 362],
            [372, 380],
            [330, 415],
            [310, 432],
            [285, 420],
            [255, 400],
            [245, 385],
          ],
        },
      ],
    },
    {
      name: 'sash',
      take: [
        box(183, 651, 428, 697),
        { disc: { c: [300, 680], r: 27 } },
        {
          polygon: [
            [262, 695],
            [336, 695],
            [338, 910],
            [296, 912],
            [296, 880],
            [255, 880],
            [255, 760],
          ],
        },
      ],
    },
    { name: 'robe', take: [box(-1, 697, FAR, FAR)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
};

/** His left sleeve seated (single-9, the viewer's right, under the mantle): its inner edge, a dark teal crease down to the cuff over his knee. */
const SINGLE_9_LEFT: Sleeve = {
  inner: [
    [436, 445],
    [429, 478],
    [425, 520],
    [423, 560],
    [421, 600],
    [416, 622],
    [411, 650],
    [403, 672],
    [394, 690],
  ],
  shoulder: JOINTS['single-9'].shoulderLeft,
  cap: 13,
  side: 'right',
};
const single9Left = sleeve(SINGLE_9_LEFT);

/**
 * His seated raise (single-9), read off gridded 2-3x crops of the view: his
 * right arm raised as on single-1, the bottle in his hand beside his cheek,
 * a polygon from the bottle's top down the upper arm's soft crease to the
 * sleeve's foot; his left arm bent under the mantle, its sleeve on its dark
 * teal crease, its round hand resting on his knee and the cuff's end beside
 * it; his head above his chin and his neck's skin to the collar's V; the
 * sash's band, knot and ends; his lap below the sash. His lap, stool and
 * sandals stand with the root, so they are one part.
 */
const SINGLE_9: PartCut = {
  parts: [
    {
      name: 'armRight',
      take: [
        {
          polygon: [
            [-1, 185],
            [144, 185],
            [146, 380],
            [141, 437],
            [150, 432],
            [165, 423],
            [180, 413],
            [195, 403],
            [211, 396],
            [211, 420],
            [206, 450],
            [203, 500],
            [200, 545],
            [196, 559],
            [177, 559],
            [173, 565],
            [171, 600],
            [-1, 610],
          ],
        },
      ],
      pivot: JOINTS['single-9'].shoulderRight,
    },
    {
      name: 'armLeft',
      take: [
        ...single9Left.take,
        { disc: { c: [442, 718], r: 50 } },
        {
          polygon: [
            [470, 680],
            [FAR, 680],
            [FAR, 728],
            [535, 732],
            [510, 748],
            [480, 762],
          ],
        },
      ],
      unless: single9Left.unless,
      pivot: JOINTS['single-9'].shoulderLeft,
    },
    {
      name: 'head',
      take: [
        box(-1, -1, FAR, 362),
        {
          polygon: [
            [248, 360],
            [374, 360],
            [374, 392],
            [366, 404],
            [355, 408],
            [345, 415],
            [335, 420],
            [320, 426],
            [310, 431],
            [300, 427],
            [290, 423],
            [280, 418],
            [270, 411],
            [260, 401],
            [252, 394],
            [245, 386],
          ],
        },
      ],
    },
    {
      name: 'sash',
      take: [
        box(186, 637, 412, 692),
        { disc: { c: [301, 660], r: 30 } },
        {
          polygon: [
            [266, 688],
            [341, 688],
            [346, 740],
            [352, 930],
            [356, 962],
            [298, 966],
            [296, 900],
            [248, 900],
            [246, 785],
            [262, 740],
          ],
        },
      ],
    },
    { name: 'robe', take: [box(-1, 692, FAR, FAR)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
};

/**
 * His wince (single-5), a bust as heads-4, read off gridded 3x crops: his
 * head above the row where his jaw's ink meets his neck's outline, with the
 * shadow his chin casts on his neck between those outlines; his neck below
 * it, his collar and garments.
 */
const SINGLE_5: PartCut = {
  parts: [
    {
      name: 'head',
      take: [
        {
          polygon: [
            [-1, -1],
            [FAR, -1],
            [FAR, 252],
            [197, 252],
            [197, 287],
            [109, 287],
            [109, 252],
            [-1, 252],
          ],
        },
      ],
      pivot: [152, 286],
    },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
};

/** His sheets' ink, for the row that closes a bust's foot. */
const INK = [42, 30, 24, 255] as const;

/** Where his body's sides run under his arms: out to his shoulders and robe, not in at the sleeves' inner edges. */
const SIDES = sides({ pronoun: 'his', lower: 'robe', cloth: 'the tunic and mantle' });

/**
 * Where his body's sides run under his arms as he sits: in to the ends of
 * his sash, as his lap below it spreads wider than his body, and on the
 * viewer's left into the piece of his side's outline still drawn above the
 * sash.
 */
const SEATED_SIDES =
  "Each side of his body runs from the outer end of his shoulder down to the outer end of his white sash, so his body under the arms is no wider than his shoulders and his sash; on the viewer's left it runs on into the short piece of his side's outline still drawn just above the sash, with no step. His lap below the sash is wider than his body and keeps its own outline. The tunic and mantle fill everything inside those lines with the same soft shading the sheet paints beside each arm.";

/** The paper grain his sheet shows on his sash and torso, carried into the paint under his arms. */
const GRAIN = grain('the white sash and the tunic and mantle of his body');

/**
 * Each view's moving parts (what a pose moves, whose areas are painted
 * magenta and repainted beneath), and the words okra repaints them by: what
 * lies under them, in the sheet's own style; and any calls granted beyond
 * the three a view takes, with who granted them, when and why.
 */
const HIDDEN_ENTRIES = {
  front: {
    moving: ['armRight', 'armLeft'],
    prompt: `${CUT_AWAY} his two arms (sleeves and round hands) were cut away to make a cut-out puppet. Repaint ONLY the magenta areas, as what lies underneath his arms: the sides of his body, from each armpit down to the robe, each side closed by the same thick dark brown-black outline as the rest of him, painted in exactly the same style, colours and soft shading (cream tunic on the viewer's left side, the teal-blue mantle on the viewer's right side, the white sash running round to each side of his waist). ${SIDES} There are no arms now: no sleeves, no hands, nothing magenta left. Where the magenta lay outside his body, it becomes the plain cream paper. Keep every other pixel exactly as it is: the same head, face, hair, robe, sash, feet, size, position and framing.`,
  },
  threeQuarterLeft: {
    moving: ['armRight', 'armLeft'],
    prompt: `${CUT_AWAY} his two arms (sleeves and round hands) were cut away to make a cut-out puppet. He is turned three-quarters to the viewer's left. Repaint ONLY the magenta areas, as what lies underneath his arms: the sides of his body, from each armpit down to the robe, each side closed by the same thick dark brown-black outline as the rest of him, painted in exactly the same style, colours and soft shading (the cream tunic on the viewer's left side, the teal-blue mantle on the viewer's right side, the white sash running round his waist). ${SIDES} ${shade('his')} ${GRAIN} There are no arms now: no sleeves, no hands, nothing magenta left. Where the magenta lay outside his body, it becomes the plain cream paper. Keep every other pixel exactly as it is: the same head, face, hair, robe, sash, feet, size, position and framing.`,
    allowance: {
      calls: 3,
      by: 'coordinator',
      on: '2026-10-27',
      why: 'its three calls were drawn on a hand cut that gave the arms body pixels; the cut was fixed after them (hands as rings), and the fixed cut had never been asked',
    },
    named: [
      {
        bar: 'grain',
        part: 'sash',
        by: 'coordinator',
        on: '2026-10-27',
        why: "okra paints the sash under his arms flatter than the sheet's paper grain on it, under both the box and the point lay and after a call that asked for the grain; every other bar holds",
      },
    ],
  },
  'heads-4': {
    moving: ['head'],
    prompt: `${CUT_AWAY} his head (his hair, face and ears) was cut away to make a cut-out puppet. Repaint ONLY the magenta area, as what lies behind his head: his neck rising straight up from his collar as a plain column of skin to about where his mouth was, its two sides closed by the same thick dark brown-black outline as the rest of him, its top simply rounded and closed by the same outline (no opening, no rim, no dark band), in exactly the same skin colour, soft shading and fine paper grain as his neck below. Everywhere else in the magenta area becomes the plain cream paper. There is no head now: no hair, no face, no ears, nothing magenta left. ${KEEP_REST}`,
  },
  'single-1': {
    moving: ['armRight', 'armLeft'],
    prompt: `${CUT_AWAY} his two arms were cut away to make a cut-out puppet: his right arm (on the viewer's left), raised with its elbow tucked against his side and its hand holding a baby bottle beside his cheek, and his left arm (on the viewer's right), hanging under the teal-blue mantle with its hand at his hip. Repaint ONLY the magenta areas, as what lies underneath his arms: the sides of his body, from each shoulder and armpit down to the sash and robe, each side closed by the same thick dark brown-black outline as the rest of him, painted in exactly the same style, colours and soft shading (the cream tunic on the viewer's left side, the teal-blue mantle over his left shoulder on the viewer's right side). ${SIDES} ${shade('his')} ${GRAIN} There are no arms now: no sleeves, no hands, no bottle, nothing magenta left. Where the magenta lay outside his body, beside his head and shoulders, it becomes the plain cream paper. Keep every other pixel exactly as it is: the same head, face, hair, neck, sash, robe, feet, size, position and framing.`,
    allowance: {
      calls: 2,
      by: 'orchestrator',
      on: '2026-10-30',
      why: 'its three calls were drawn before the held bottle was part of the right arm; holding it changes the magenta input, so no kept answer lays on the present input',
    },
  },
  'single-9': {
    moving: ['armRight', 'armLeft'],
    prompt: `${CUT_AWAY} his two arms were cut away to make a cut-out puppet. He sits on a wooden stool. His right arm (on the viewer's left) was raised with its hand holding a baby bottle beside his cheek; his left arm (on the viewer's right) was bent under the teal-blue mantle with its round hand resting on his knee. Repaint ONLY the magenta areas, as what lies underneath his arms: the sides of his body, from each shoulder and armpit down to the sash, each side closed by the same thick dark brown-black outline as the rest of him, painted in exactly the same style, colours and soft shading (the cream tunic on the viewer's left side, the teal-blue mantle over his left shoulder on the viewer's right side), and his lap under his left hand, the cream tunic and the teal mantle over his thigh as they run on beside it. ${SEATED_SIDES} ${shade('his')} There are no arms now: no sleeves, no hands, no bottle, nothing magenta left. Where the magenta lay outside his body, beside his head and shoulders, it becomes the plain cream paper. Keep every other pixel exactly as it is: the same head, face, hair, neck, sash, lap, stool, sandals, size, position and framing.`,
  },
  'single-5': {
    moving: ['head'],
    prompt: `${CUT_AWAY} his head (his hair, face and ears) was cut away to make a cut-out puppet. Repaint ONLY the magenta area, as what lies behind his head: his neck rising straight up from his collar as a plain column of skin to about where his mouth was, its two sides closed by the same thick dark brown-black outline as the rest of him, its top simply rounded and closed by the same outline (no opening, no rim, no dark band), in exactly the same skin colour, soft shading and fine paper grain as his neck below. Everywhere else in the magenta area becomes the plain cream paper. There is no head now: no hair, no face, no ears, nothing magenta left. ${KEEP_REST}`,
  },
} as const satisfies Readonly<Record<CutView, HiddenEntry>>;

/** His cut table: each view's cut, how its figure is read, and what its label rules read (his colour classes and the view's part labels). */
export const { CUTS, cutOptionsFor, HIDDEN, GAPS, paperOf } = cutTable({
  frames: FRAMES,
  views: {
    front: {
      cut: FRONT,
      figure: 'framed',
      reads: { classes: CLASSES, labels: LABELS.front },
      gaps: [{ at: [124, 634], box: [106, 624, 144, 645], why: 'the ground between his feet' }],
    },
    threeQuarterLeft: {
      cut: THREE_QUARTER_LEFT,
      figure: 'framed',
      reads: { classes: CLASSES, labels: LABELS.threeQuarterLeft },
      gaps: [{ at: [109, 633], box: [92, 623, 128, 645], why: 'the ground between his feet' }],
    },
    'heads-4': { cut: HEADS_4, figure: 'bust' },
    'single-1': {
      cut: SINGLE_1,
      figure: 'framed',
      gaps: [
        { at: [318, 1221], box: [286, 1203, 352, 1241], why: 'the ground between his feet' },
        {
          at: [166, 1187],
          box: [159, 1181, 174, 1195],
          why: 'the ground in the notch between his hem and his left foot',
        },
      ],
    },
    'single-9': {
      cut: SINGLE_9,
      figure: 'framed',
      gaps: [
        { at: [319, 1041], box: [282, 1023, 356, 1060], why: 'the ground between his feet' },
        {
          at: [154, 1018],
          box: [147, 1003, 162, 1033],
          why: "the ground in the notch between his hem, his right sandal and the stool's leg",
        },
        {
          at: [483, 1015],
          box: [471, 1002, 496, 1028],
          why: "the ground in the notch between his hem, his left sandal and the stool's leg",
        },
      ],
    },
    'single-5': { cut: SINGLE_5, figure: 'bust' },
  },
  hidden: HIDDEN_ENTRIES,
  ink: INK,
});

/** What each view's laid part sheet runs before it is written (`film concept parts`): single-9's right arm drops the two specks of paper and ink its paint leaves floating off his sleeve. */
export const CLEAN = {
  'single-9': clearSpecks('armRight', 50),
} satisfies Partial<Record<keyof typeof CUTS, SheetClean>>;
