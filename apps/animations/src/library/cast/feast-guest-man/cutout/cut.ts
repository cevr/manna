import type { HiddenEntry, PartCut } from '@manna/film/tools';
import { CUT_AWAY, shade, sides } from '../../../cutout/prompts.ts';
import { FAR, box } from '../../../cutout/rules.ts';
import { cutTable } from '../../../cutout/table.ts';
import { FRAMES, type FramedView } from './frames.ts';
import { JOINTS } from './joints.ts';

export { FRAMES, JOINTS };

/** His chin's row: the head is every row above it, the top of his headcloth's drape with it, as the feast mother's veil is cut; the drape below rides his torso. */
const CHIN = 267;

/** His hip's row, at his lap below his hands: the robe is every row below it that his arms leave, with his stool, his sandals and his mantle's lower ends. */
const HIP = 545;

const POSES_1: PartCut = {
  parts: [
    {
      name: 'armRight',
      take: [
        { disc: { c: [92, 534], r: 45 } },
        {
          polygon: [
            [-1, 314],
            [34, 314],
            [64, 335],
            [84, 307],
            [98, 299],
            [107, 330],
            [110, 400],
            [118, 470],
            [128, 500],
            [92, 534],
            [50, 553],
            [30, 549],
            [-1, 546],
          ],
        },
      ],
      pivot: JOINTS['poses-1'].shoulderRight,
    },
    {
      name: 'armLeft',
      take: [
        { disc: { c: [320, 537], r: 45 } },
        {
          polygon: [
            [408, 316],
            [380, 316],
            [348, 337],
            [334, 301],
            [316, 296],
            [318, 330],
            [306, 400],
            [295, 470],
            [281, 500],
            [320, 537],
            [362, 553],
            [382, 552],
            [408, 550],
          ],
        },
      ],
      pivot: JOINTS['poses-1'].shoulderLeft,
    },
    { name: 'head', take: [box(-1, -1, FAR, CHIN)] },
    { name: 'robe', take: [box(-1, HIP, FAR, FAR)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
};

/** His sheet's outline ink, the darkest 1 % of his kept view (median 16,4,0). */
const INK = [16, 4, 0, 255] as const;

/** Where his body's sides run under his wide sleeves: out to his shoulders and robe, not out to the sleeves' outer edges. */
const SIDES = sides({
  pronoun: 'his',
  lower: 'robe',
  cloth: 'the walnut-brown mantle and its soft folds',
});

/** What his view keeps as it is. */
const KEEP = `Keep every other pixel exactly as it is: the same white headcloth with its indigo band and its drape, face, mantle, robe, stool, sandals, contact shadow, size, position and framing.`;

/**
 * His view's moving parts (whose areas are painted magenta and repainted
 * beneath), and the words okra repaints them by: what lies under them, in the
 * sheet's own style. As the lead's seated view's prompt, it names no grain:
 * okra reads that sentence as speckle on the lap.
 */
const HIDDEN_ENTRIES = {
  'poses-1': {
    moving: ['armRight', 'armLeft'],
    prompt: `${CUT_AWAY} his two arms (wide white sleeves and round hands) were cut away to make a cut-out puppet. He is a young man in a long white robe with a walnut-brown mantle open down the front, a white headcloth with an indigo band whose drape hangs behind his shoulders, seated on a low wooden stool facing the viewer with his hands resting on his knees. Repaint ONLY the magenta areas, as what lies underneath his arms: the sides of his body below the drape's hem, his walnut-brown mantle falling from each shoulder down his side to its lower end beside his lap, each side closed by the same thick dark brown-black outline as the rest of him, painted in exactly the same style, colours and soft shading as his mantle beside each arm; where the magenta lay over his lap, his white robe and its soft folds. ${SIDES} ${shade('his')} There are no arms now: no sleeves, no hands, nothing magenta left. Where the magenta lay outside his body, it becomes the plain cream paper. ${KEEP}`,
  },
} as const satisfies Readonly<Record<FramedView, HiddenEntry>>;

export const { CUTS, cutOptionsFor, HIDDEN, GAPS, paperOf } = cutTable({
  frames: FRAMES,
  views: {
    'poses-1': {
      cut: POSES_1,
      figure: 'framed',
      gaps: [
        { at: [206, 685], box: [177, 679, 237, 695], why: 'the ground between his feet' },
        {
          at: [60, 680],
          box: [43, 657, 78, 696],
          why: "the ground in the notch between his stool's leg, his hem and his right sandal",
        },
        {
          at: [352, 680],
          box: [338, 657, 366, 696],
          why: "the ground in the notch between his left sandal, his hem and his stool's leg",
        },
      ],
    },
  },
  hidden: HIDDEN_ENTRIES,
  ink: INK,
});
