// How the woman's seated view is cut into parts (`film concept parts`): which
// part each pixel of her kept view goes to, and what lies under her arms. She
// sits on her stool facing the viewer, her round hands on her knees. Her olive
// mantle is drawn over her head as a veil, and its drape hangs behind her
// shoulders to a tip beside each arm: the shoulder's outline crosses in front
// of it, and each arm runs from that outline down to the hand. Each arm is the
// mantle over it, the dark crease where the mantle folds in at its front (the
// cut runs down the crease's inner edge, so the crease's ink stays whole on the
// arm), its cream cuff and its round hand (a disc), which lies in front of the
// cuff and her knee. Pure data.

import type { HiddenEntry, PartCut } from '@manna/film/tools';
import { CUT_AWAY, shade, sides } from '../../../cutout/prompts.ts';
import { FAR, box } from '../../../cutout/rules.ts';
import { cutTable } from '../../../cutout/table.ts';
import { FRAMES, type FramedView } from './frames.ts';
import { JOINTS } from './joints.ts';

export { FRAMES, JOINTS };

/** Her chin's row: the head is every row above it, the top of her veil with it, as the feast mother's veil is cut; the veil's drape below rides her torso. */
const CHIN = 260;

/** Her hip's row, at her lap just above her stool's planks: the robe is every row below it that her arms leave, with her stool, her sandals and the lap's fold line. */
const HIP = 521;

const POSES_1: PartCut = {
  parts: [
    // her right arm on the viewer's left: from the veil drape's tip along the shoulder's outline, down the mantle's crease and the cuff's inner ink to the hand on her knee, back up the cuff's outer outline
    {
      name: 'armRight',
      take: [
        { disc: { c: [100, 529], r: 44 } },
        {
          polygon: [
            [-1, 392],
            [34, 391],
            [39, 380],
            [45, 369],
            [50, 357],
            [55, 345],
            [60, 335],
            [65, 325],
            [70, 317],
            [75, 309],
            [80, 302],
            [85, 297],
            [90, 292],
            [95, 288],
            [100, 284],
            [105, 281],
            [107, 279],
            [107, 400],
            [108, 440],
            [110, 445],
            [112, 450],
            [119, 460],
            [125, 470],
            [130, 480],
            [135, 490],
            [139, 500],
            [142, 510],
            [100, 529],
            [57, 560],
            [52, 557],
            [43, 550],
            [35, 540],
            [28, 527],
            [20, 512],
            [-1, 512],
          ],
        },
      ],
      pivot: JOINTS['poses-1'].shoulderRight,
    },
    // her left arm on the viewer's right
    {
      name: 'armLeft',
      take: [
        { disc: { c: [282, 529], r: 44 } },
        {
          polygon: [
            [FAR, 392],
            [349, 392],
            [342, 381],
            [337, 369],
            [332, 357],
            [327, 346],
            [322, 336],
            [317, 326],
            [312, 318],
            [307, 310],
            [302, 303],
            [297, 297],
            [292, 293],
            [287, 289],
            [282, 285],
            [277, 282],
            [273, 280],
            [273, 440],
            [271, 445],
            [269, 450],
            [264, 460],
            [257, 470],
            [252, 480],
            [247, 490],
            [242, 500],
            [240, 510],
            [282, 529],
            [327, 560],
            [334, 555],
            [341, 548],
            [348, 541],
            [353, 533],
            [363, 512],
            [FAR, 512],
          ],
        },
      ],
      pivot: JOINTS['poses-1'].shoulderLeft,
    },
    // above her chin, her veil's top with it
    { name: 'head', take: [box(-1, -1, FAR, CHIN)] },
    { name: 'robe', take: [box(-1, HIP, FAR, FAR)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
};

/** Her sheet's outline ink, the darkest 1 % of her kept view (median 24,7,1). */
const INK = [24, 7, 1, 255] as const;

/** Where her body's sides run under her arms: out to her shoulders and robe, not out to the mantle's outer edges over her arms. */
const SIDES = sides({
  pronoun: 'her',
  lower: 'robe',
  cloth: 'the olive mantle and its soft folds',
});

/** What her view keeps as it is. */
const KEEP = `Keep every other pixel exactly as it is: the same olive veil and its drape, face, mantle, cream robe, sash, stool, sandals, contact shadow, size, position and framing.`;

/**
 * Her view's moving parts (whose areas are painted magenta and repainted
 * beneath), and the words okra repaints them by: what lies under them, in the
 * sheet's own style. As the man's seated view's prompt, it names no grain:
 * okra reads that sentence as speckle on the lap.
 */
const HIDDEN_ENTRIES = {
  'poses-1': {
    moving: ['armRight', 'armLeft'],
    prompt: `${CUT_AWAY} her two arms (the olive mantle over each arm, its cream cuff and her round hand) were cut away to make a cut-out puppet. She is a young woman in a long cream robe with a plain sash, her olive mantle drawn over her head as a veil, its drape hanging behind her shoulders, seated on a low wooden stool facing the viewer with her hands resting on her knees. Repaint ONLY the magenta areas, as what lies underneath her arms: the sides of her body below the veil's drape, her olive mantle falling from each shoulder down her side to its lower end beside her lap, each side closed by the same thick dark brown-black outline as the rest of her, painted in exactly the same style, colours and soft shading as her mantle beside each arm; where the magenta lay over her lap, her cream robe and its soft folds; where it lay over the ends of her stool's planks, the same wooden stool. ${SIDES} ${shade('her')} There are no arms now: no sleeves, no cuffs, no hands, nothing magenta left. Where the magenta lay outside her body, it becomes the plain cream paper. ${KEEP}`,
  },
} as const satisfies Readonly<Record<FramedView, HiddenEntry>>;

export const { CUTS, cutOptionsFor, HIDDEN, GAPS, paperOf } = cutTable({
  frames: FRAMES,
  views: {
    'poses-1': {
      cut: POSES_1,
      figure: 'framed',
      gaps: [
        {
          at: [56, 638],
          box: [49, 634, 67, 646],
          why: "the ground in the notch between her stool's leg, her hem and her right sandal",
        },
        {
          at: [325, 638],
          box: [318, 632, 334, 649],
          why: "the ground in the notch between her left sandal, her hem and her stool's leg",
        },
      ],
    },
  },
  hidden: HIDDEN_ENTRIES,
  ink: INK,
});
