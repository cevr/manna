// Paul's kept heads views cut into parts (`cutParts`, @manna/film's part
// sheet): each part his own pixels, front to back, so that his head can turn
// while every pixel at rest stays the sheet's. Each view is a bust of two
// parts, his head over the rest: his head (bald crown, the dark hair at its
// sides and back, face, ears and long beard) above a line that follows the
// foot of his beard's ink, and below it the skin of his neck, his cream tunic
// and blue-violet mantle. The lines are polygons read off 3x class maps of each
// view. Each view names the parts a pose moves, and the words okra repaints
// what they hide by (`HIDDEN`, read by `film concept parts`, which writes
// `sheets/<view>/`). The lines are read in the kept view's pixels; the shared
// cut table (`library/cutout/table.ts`) lays them in each view's part sheet
// frame, its kept box padded (`frames.ts`), and reads each bust's figure with
// the foot of the view closed. Data: the rules and the table are the shared
// module's.

import { bustCut, bustHidden } from '../../../cutout/bust.ts';
import { FAR, box } from '../../../cutout/rules.ts';
import { cutTable } from '../../../cutout/table.ts';
import { FRAMES } from './frames.ts';

export { FRAMES };

/** A view of his, by its name in his sheet's views. */
type CutView = keyof typeof FRAMES;

// The heads views stand close on his sheet, so a box, kept or padded, reaches
// into its neighbour's: the edge of heads-2's head lies at heads-1's right
// side, mostly inside heads-1's kept box (sheet x 275-281) and the rest in its
// pad; heads-2's left pad holds heads-1's shoulder and its right pad the edge
// of heads-3's head, and heads-3's left pad heads-2's shoulder. The cutter refuses a figure pixel
// no part takes, so a first, still part takes those pixels; the puppet leaves
// it out of its parts, so the render draws no figure but his own.

/** His bust three-quarters to the viewer's left (heads-1), the line at the foot of his beard. */
const HEADS_1 = bustCut({
  // the edge of heads-2's head at this box's right side, inside the kept box (sheet x 275-281) and its pad: never drawn
  neighbour: [box(236, 40, FAR, 170)],
  line: [
    [FAR, 210],
    [170, 210],
    [170, 212],
    [148, 212],
    [144, 216],
    [140, 220],
    [136, 224],
    [131, 228],
    [126, 232],
    [118, 236],
    [108, 240],
    [84, 244],
    [82, 247],
    [60, 247],
    [58, 243],
    [48, 238],
    [-1, 238],
  ],
  pivot: [118, 240],
});

/** His bust with his head bowed down to the viewer's left (heads-2). */
const HEADS_2 = bustCut({
  // heads-1's shoulder in this box's left pad and the edge of heads-3's head in its right pad: never drawn
  neighbour: [box(-1, 265, 8, FAR), box(230, 40, FAR, 120)],
  line: [
    [FAR, 204],
    [181, 204],
    [181, 210],
    [151, 210],
    [149, 216],
    [146, 220],
    [143, 224],
    [140, 228],
    [136, 232],
    [131, 236],
    [126, 240],
    [119, 244],
    [107, 249],
    [100, 250],
    [74, 250],
    [70, 244],
    [65, 240],
    [56, 236],
    [48, 232],
    [-1, 232],
  ],
  pivot: [124, 244],
});

/** His bust three-quarters to the viewer's left (heads-3). */
const HEADS_3 = bustCut({
  // heads-2's shoulder in this box's left pad: never drawn
  neighbour: [box(-1, 285, 6, FAR)],
  line: [
    [FAR, 208],
    [162, 208],
    [162, 212],
    [136, 212],
    [132, 216],
    [129, 220],
    [125, 224],
    [121, 228],
    [116, 232],
    [110, 236],
    [102, 240],
    [92, 244],
    [82, 248],
    [80, 250],
    [44, 250],
    [40, 247],
    [-1, 247],
  ],
  pivot: [112, 244],
});

/** His bust facing the viewer (heads-4), his beard's foot a rounded point. */
const HEADS_4 = bustCut({
  line: [
    [FAR, 223],
    [165, 223],
    [161, 228],
    [158, 232],
    [154, 236],
    [149, 240],
    [142, 244],
    [132, 248],
    [124, 252],
    [110, 252],
    [104, 248],
    [95, 244],
    [88, 240],
    [83, 236],
    [78, 232],
    [73, 228],
    [70, 223],
    [-1, 223],
  ],
  pivot: [117, 240],
});

/** His bust facing the viewer (heads-5). */
const HEADS_5 = bustCut({
  line: [
    [FAR, 222],
    [170, 222],
    [166, 228],
    [162, 232],
    [158, 236],
    [152, 240],
    [145, 244],
    [134, 248],
    [126, 252],
    [110, 252],
    [108, 248],
    [97, 244],
    [90, 240],
    [84, 236],
    [80, 232],
    [76, 228],
    [73, 222],
    [-1, 222],
  ],
  pivot: [121, 242],
});

/** His bust facing the viewer, his mouth open (heads-6). */
const HEADS_6 = bustCut({
  line: [
    [FAR, 222],
    [171, 222],
    [164, 228],
    [159, 232],
    [153, 236],
    [145, 240],
    [138, 244],
    [112, 244],
    [105, 240],
    [96, 236],
    [89, 232],
    [84, 228],
    [80, 222],
    [-1, 222],
  ],
  pivot: [123, 240],
});

/** His sheet's ink, for the row that closes a bust's foot. */
const INK = [42, 21, 7, 255] as const;

/**
 * His words for what lies behind his head once it is cut away, and how he is
 * turned in each view. The shared bust moves only his head, so okra repaints
 * only what it hid, in the sheet's own style.
 */
const HIDDEN_ENTRIES = bustHidden(
  {
    head: 'his bald crown, the dark hair at its sides and back, his face, ears and long beard',
    behind:
      ': his neck rising straight up from his collar as a plain column of skin to about where his mouth was, its two sides closed by the same thick dark brown-black outline as the rest of him, its top simply rounded and closed by the same outline (no opening, no rim, no dark band), in exactly the same skin colour, soft shading and fine paper grain as the skin of his neck below. Everywhere else in the magenta area becomes the plain cream paper. There is no head now: no hair, no beard, no face, no ears, nothing magenta left.',
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

/** His cut table: each view's cut and how its figure is read. */
export const { CUTS, cutOptionsFor, HIDDEN } = cutTable({
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
