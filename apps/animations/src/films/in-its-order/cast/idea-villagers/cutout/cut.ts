import type { HiddenEntry, PartCut, SheetClean } from '@manna/film/tools';
import { Record as Records } from 'effect';
import { type PaperRim, clearPaperRim } from '../../../../../library/cutout/clean.ts';
import { CUT_AWAY, grain, shade, sides } from '../../../../../library/cutout/prompts.ts';
import { FAR, box } from '../../../../../library/cutout/rules.ts';
import { cutTable } from '../../../../../library/cutout/table.ts';
import { FRAMES } from './frames.ts';
import { JOINTS } from './joints.ts';
import { PAPERS } from './papers.ts';

export { FRAMES, JOINTS };

type CutView = keyof typeof FRAMES;

const POSES_3: PartCut = {
  parts: [
    { name: 'neighbour', take: [box(270, 300, FAR, FAR)] },
    {
      name: 'armLeft',
      take: [
        { disc: { c: [318, 170], r: 28 } },
        {
          polygon: [
            [210, 168],
            [225, 150],
            [300, 140],
            [300, 232],
            [240, 230],
            [205, 240],
            [195, 205],
          ],
        },
      ],
      pivot: JOINTS['poses-3'].shoulderLeft,
    },
    {
      name: 'armRight',
      take: [
        { disc: { c: [25, 240], r: 26 } },
        {
          polygon: [
            [-1, 175],
            [90, 175],
            [95, 215],
            [80, 262],
            [50, 272],
            [-1, 272],
          ],
        },
      ],
      pivot: JOINTS['poses-3'].shoulderRight,
    },
    { name: 'head', take: [box(-1, -1, FAR, 168)] },
    { name: 'robe', take: [box(-1, 290, FAR, FAR)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
};

const POSES_4: PartCut = {
  parts: [
    {
      name: 'armRight',
      take: [
        {
          polygon: [
            [30, 128],
            [58, 128],
            [84, 148],
            [84, 184],
            [52, 184],
            [36, 150],
          ],
        },
      ],
      pivot: JOINTS['poses-4'].shoulderRight,
    },
    {
      name: 'armLeft',
      take: [
        {
          polygon: [
            [114, 128],
            [142, 128],
            [134, 150],
            [132, 184],
            [90, 184],
            [90, 148],
          ],
        },
      ],
      pivot: JOINTS['poses-4'].shoulderLeft,
    },
    { name: 'head', take: [box(-1, -1, FAR, 128)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
};

const POSES_6: PartCut = {
  parts: [
    {
      name: 'armRight',
      take: [
        { disc: { c: [25, 322], r: 24 } },
        {
          polygon: [
            [-1, 178],
            [48, 178],
            [50, 305],
            [-1, 305],
          ],
        },
      ],
      pivot: JOINTS['poses-6'].shoulderRight,
    },
    {
      name: 'armLeft',
      take: [
        { disc: { c: [180, 322], r: 24 } },
        {
          polygon: [
            [158, 178],
            [FAR, 178],
            [FAR, 305],
            [156, 305],
          ],
        },
      ],
      pivot: JOINTS['poses-6'].shoulderLeft,
    },
    { name: 'head', take: [box(-1, -1, FAR, 150)] },
    { name: 'robe', take: [box(-1, 300, FAR, FAR)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
};

const SINGLE_15: PartCut = {
  parts: [
    {
      name: 'armRight',
      take: [
        {
          polygon: [
            [-1, 400],
            [46, 400],
            [58, 405],
            [67, 407],
            [72, 401],
            [80, 386],
            [90, 374],
            [100, 365],
            [106, 361],
            [187, 361],
            [199, 365],
            [209, 368],
            [216, 370],
            [221, 372],
            [224, 374],
            [226, 376],
            [227, 379],
            [227, 384],
            [226, 390],
            [225, 400],
            [223, 410],
            [221, 420],
            [219, 430],
            [216, 440],
            [212, 450],
            [207, 460],
            [203, 466],
            [202, 478],
            [199, 488],
            [194, 497],
            [188, 504],
            [182, 510],
            [176, 515],
            [170, 517],
            [165, 524],
            [160, 535],
            [150, 548],
            [140, 559],
            [130, 568],
            [120, 575],
            [110, 581],
            [100, 587],
            [92, 597],
            [-1, 599],
          ],
        },
      ],
      pivot: JOINTS['single-15'].shoulderRight,
    },
    {
      name: 'armLeft',
      take: [
        { disc: { c: [392, 710], r: 55 } },
        {
          polygon: [
            [328, 402],
            [FAR, 402],
            [FAR, 672],
            [342, 672],
            [341, 660],
            [339, 620],
            [336, 580],
            [334, 540],
            [334, 480],
            [331, 450],
          ],
        },
      ],
      pivot: JOINTS['single-15'].shoulderLeft,
    },
    { name: 'head', take: [box(-1, -1, FAR, 341)] },
    { name: 'robe', take: [box(-1, 672, FAR, FAR)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
};

const INK = [6, 1, 0, 255] as const;

const SIDES = sides({
  pronoun: 'his',
  lower: 'tunic',
  cloth: 'the undyed linen tunic and its soft folds',
});

const GRAIN = grain('the linen tunic of his body');

const KEEP = `Keep every other pixel exactly as it is: the same linen headcloth and its band, face, beard, tunic, sandals, size, position and framing.`;

const HIDDEN_ENTRIES = {
  'poses-3': {
    moving: ['armRight', 'armLeft'],
    prompt: `${CUT_AWAY} his two arms (linen sleeves and round hands) were cut away to make a cut-out puppet. He is a plain villager in an undyed linen tunic to the shins, a linen headcloth tied with a walnut band and a short dark beard, hopping on one foot. Repaint ONLY the magenta areas, as what lies underneath his arms: the sides of his body below the headcloth, down to his tunic, each side closed by the same thick dark brown-black outline as the rest of him, painted in exactly the same style, colours and soft shading as his tunic beside each arm. ${SIDES} ${shade('his')} ${GRAIN} There are no arms now: no sleeves, no hands, nothing magenta left. Where the magenta lay outside his body, it becomes the plain cream paper. ${KEEP}`,
  },
  'poses-4': {
    moving: ['armRight', 'armLeft'],
    prompt: `${CUT_AWAY} his two small arms (sleeves of his wrap and round hands) were cut away to make a cut-out puppet. He is a baby sitting with his knees up, wrapped in plain linen, a small tuft on his round head. Repaint ONLY the magenta areas, as what lies underneath his arms: his chest and the wrap over his lap between his knees, closed by the same thick dark brown-black outline as the rest of him, painted in exactly the same style, colours and soft shading as the wrap beside each arm. ${shade('his')} ${grain('the linen wrap of his body')} There are no arms now: no sleeves, no hands, nothing magenta left. Where the magenta lay outside his body, it becomes the plain cream paper. Keep every other pixel exactly as it is: the same head, face, knees, feet, size, position and framing.`,
  },
  'poses-6': {
    moving: ['armRight', 'armLeft'],
    prompt: `${CUT_AWAY} his two arms (linen sleeves and round hands) were cut away to make a cut-out puppet. He is a plain villager in an undyed linen tunic to the shins, a linen headcloth tied with a walnut band and a short dark beard, standing facing the viewer with his arms hanging at his sides. Repaint ONLY the magenta areas, as what lies underneath his arms: the sides of his body below the headcloth, down to his tunic, each side closed by the same thick dark brown-black outline as the rest of him, painted in exactly the same style, colours and soft shading as his tunic beside each arm. ${SIDES} ${shade('his')} ${GRAIN} There are no arms now: no sleeves, no hands, nothing magenta left. Where the magenta lay outside his body, it becomes the plain cream paper. ${KEEP}`,
  },
  'single-15': {
    moving: ['armRight', 'armLeft'],
    prompt: `${CUT_AWAY} his two arms were cut away to make a cut-out puppet: his right arm (on the viewer's left), raised with its elbow out at his side and its round hand holding a small clay cup before his chest, and his left arm (on the viewer's right), hanging at his side with its round hand by his hip. He is a plain villager in an undyed linen tunic to the shins, a linen headcloth tied with a walnut band and a short dark beard, standing facing the viewer. Repaint ONLY the magenta areas, as what lies underneath his arms: his chest below his beard and the headcloth, and the sides of his body from each shoulder down to his tunic, each side closed by the same thick dark brown-black outline as the rest of him, painted in exactly the same style, colours and soft shading as his tunic beside each arm. ${SIDES} ${shade('his')} ${GRAIN} There are no arms now: no sleeves, no hands, no cup, nothing magenta left. Where the magenta lay outside his body, it becomes the plain cream paper. ${KEEP}`,
  },
} as const satisfies Readonly<Record<CutView, HiddenEntry>>;

export const { CUTS, cutOptionsFor, HIDDEN, GAPS, paperOf } = cutTable({
  frames: FRAMES,
  views: {
    'poses-3': { cut: POSES_3, figure: 'framed' },
    'poses-4': { cut: POSES_4, figure: 'framed' },
    'poses-6': {
      cut: POSES_6,
      figure: 'framed',
      gaps: [{ at: [104, 485], box: [85, 476, 124, 495], why: 'the ground between the feet' }],
    },
    'single-15': {
      cut: SINGLE_15,
      figure: 'framed',
      gaps: [{ at: [221, 1068], box: [180, 1049, 267, 1091], why: 'the ground between the feet' }],
    },
  },
  hidden: HIDDEN_ENTRIES,
  ink: INK,
});

const RIM_BAND_PX_PAST_THEIR_14_SHORT_OF_THE_BABYS_CLOTH = 16;

const RIM_NEAR_DE76_PAST_THEIR_RIM_6 = 12;

export const PAPER_RIMS = Records.map(PAPERS, (paper): PaperRim => ({
  paper,
  band: RIM_BAND_PX_PAST_THEIR_14_SHORT_OF_THE_BABYS_CLOTH,
  near: RIM_NEAR_DE76_PAST_THEIR_RIM_6,
}));

export const CLEAN = Records.map(PAPER_RIMS, clearPaperRim) satisfies Partial<
  Record<keyof typeof CUTS, SheetClean>
>;
