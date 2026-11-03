import type { SheetClean } from '@manna/film/tools';
import { Record as Records } from 'effect';
import { bustCut, bustHidden } from '../../../cutout/bust.ts';
import { type PaperRim, clearPaperRim } from '../../../cutout/clean.ts';
import { FAR, box } from '../../../cutout/rules.ts';
import { cutTable } from '../../../cutout/table.ts';
import { FRAMES } from './frames.ts';
import { PAPERS } from './papers.ts';

export { FRAMES };

type CutView = keyof typeof FRAMES;

const HEADS_1 = bustCut({
  line: [
    [FAR, 297],
    [228, 296],
    [222, 272],
    [212, 257],
    [195, 245],
    [174, 236],
    [159, 226],
    [152, 205],
    [125, 205],
    [108, 213],
    [94, 215],
    [91, 216],
    [90, 222],
    [61, 231],
    [42, 241],
    [21, 262],
    [14, 276],
    [9, 296],
    [-1, 297],
  ],
  pivot: [125, 215],
});

const HEADS_2 = bustCut({
  neighbour: [box(247, 286, FAR, FAR)],
  line: [
    [FAR, 293],
    [213, 293],
    [213, 243],
    [210, 243],
    [207, 239],
    [201, 240],
    [201, 235],
    [174, 220],
    [169, 215],
    [168, 210],
    [139, 210],
    [125, 222],
    [108, 229],
    [96, 228],
    [86, 221],
    [82, 221],
    [57, 230],
    [41, 238],
    [32, 246],
    [30, 248],
    [24, 253],
    [16, 267],
    [9, 292],
    [-1, 293],
  ],
  pivot: [122, 225],
});

const HEADS_3 = bustCut({
  neighbour: [box(-1, 210, 0, 235)],
  line: [
    [FAR, 297],
    [211, 297],
    [208, 279],
    [200, 261],
    [187, 249],
    [170, 240],
    [151, 225],
    [146, 205],
    [117, 205],
    [104, 213],
    [89, 217],
    [87, 224],
    [59, 232],
    [38, 243],
    [20, 262],
    [11, 284],
    [9, 296],
    [-1, 296],
  ],
  pivot: [118, 215],
});

const HEADS_4 = bustCut({
  line: [
    [FAR, 293],
    [223, 293],
    [217, 267],
    [205, 250],
    [194, 242],
    [155, 224],
    [151, 219],
    [151, 211],
    [149, 211],
    [141, 218],
    [126, 224],
    [107, 222],
    [91, 212],
    [88, 222],
    [64, 231],
    [30, 250],
    [16, 269],
    [9, 295],
    [7, 297],
    [-1, 297],
  ],
  pivot: [120, 222],
});

const HEADS_5 = bustCut({
  line: [
    [FAR, 297],
    [225, 297],
    [223, 295],
    [219, 273],
    [212, 259],
    [196, 245],
    [154, 225],
    [150, 221],
    [149, 210],
    [145, 210],
    [137, 216],
    [125, 220],
    [110, 219],
    [94, 210],
    [90, 210],
    [89, 221],
    [86, 224],
    [57, 236],
    [31, 251],
    [16, 271],
    [9, 296],
    [-1, 297],
  ],
  pivot: [120, 220],
});

const HEADS_6 = bustCut({
  line: [
    [FAR, 298],
    [222, 298],
    [217, 274],
    [208, 257],
    [195, 246],
    [150, 225],
    [146, 213],
    [137, 220],
    [121, 226],
    [106, 225],
    [87, 215],
    [87, 222],
    [84, 225],
    [62, 234],
    [30, 252],
    [21, 261],
    [14, 274],
    [8, 298],
    [-1, 298],
  ],
  pivot: [116, 222],
});

const INK = [25, 9, 2, 255] as const;

const HIDDEN_ENTRIES = bustHidden(
  {
    head: 'his linen headcloth with its olive band and the two sides of it that hung beside his face and neck down onto his shoulders, his face and his short dark beard',
    behind:
      '. His neck rises straight up from his collar as a plain column of skin to about where his mouth was, its two sides closed by the same thick dark brown-black outline as the rest of him, its top simply rounded and closed by the same outline (no opening, no rim, no dark band), in exactly the same skin colour, soft shading and fine paper grain as the skin of his neck below. Where the cloth hung over his shoulders, his shoulders continue as they are below it: the same linen tunic and olive mantle with its violet shade, their top edges closed by the same outline. Everywhere else in the magenta area becomes the plain cream paper. There is no head now: no headcloth, no hair, no beard, no face, no ears, nothing magenta left.',
  },
  {
    'heads-1': " He is turned three-quarters to the viewer's left.",
    'heads-2': " He is turned to the viewer's left, his head bowed.",
    'heads-3': " He is turned three-quarters to the viewer's left.",
    'heads-4': ' He faces the viewer.',
    'heads-5': ' He faces the viewer.',
    'heads-6': ' He faces the viewer.',
  } satisfies Readonly<Record<CutView, string>>,
);

export const { CUTS, cutOptionsFor, HIDDEN, paperOf } = cutTable({
  frames: FRAMES,
  views: {
    'heads-1': { cut: HEADS_1, figure: 'bust' },
    'heads-2': { cut: HEADS_2, figure: 'bust' },
    'heads-3': { cut: HEADS_3, figure: 'bust' },
    'heads-4': { cut: HEADS_4, figure: 'bust' },
    'heads-5': { cut: HEADS_5, figure: 'bust' },
    'heads-6': { cut: HEADS_6, figure: 'bust' },
  },
  hidden: HIDDEN_ENTRIES,
  ink: INK,
});

const RIM_BAND_PX_PAST_HIS_8_ON_HEADS_2 = 12;

const RIM_NEAR_DE76_PAST_HIS_RIM_5 = 12;

export const PAPER_RIMS = Records.map(PAPERS, (paper): PaperRim => ({
  paper,
  band: RIM_BAND_PX_PAST_HIS_8_ON_HEADS_2,
  near: RIM_NEAR_DE76_PAST_HIS_RIM_5,
}));

export const CLEAN = Records.map(PAPER_RIMS, clearPaperRim) satisfies Partial<
  Record<keyof typeof CUTS, SheetClean>
>;
