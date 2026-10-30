// Jeremiah's kept heads views cut into parts (`cutParts`, @manna/film's part
// sheet): each part his own pixels, front to back, so that his head can turn
// while every pixel at rest stays the sheet's. Each view is a bust of two
// parts, his head over the rest. His head is his linen headcloth with its
// olive band and the two sides of it that hang beside his face and neck down
// onto his shoulders, his face and his short dark beard; the cloth is his
// head's, so it turns with him. Below it is the rest of him: the skin of his
// neck, his linen tunic and olive mantle. Each line runs along the top of his
// shoulders under the hanging cloth, up the sides of his neck and along the
// foot of his beard; it never rises above his chin, so the neck below the
// chin is the torso's. The lines are read off each view's pixels: the top of
// what can be reached from the view's foot without crossing ink, simplified
// to within 1.5 px. Each view names the parts a pose moves, and the words okra
// repaints what they hide by (`HIDDEN`, read by `film concept parts`, which
// writes `sheets/<view>/`). The lines are read in the kept view's pixels; the
// shared cut table (`library/cutout/table.ts`) lays them in each view's part
// sheet frame, its kept box padded (`frames.ts`), and reads each bust's
// figure with the foot of the view closed. His views stand apart on his sheet
// (`frames.ts`), so no view has a neighbour part. Data: the rules and the
// table are the shared module's.

import type { HiddenEntry, PartCut } from '@manna/film/tools';
import { CUT_AWAY, KEEP_REST } from '../../../cutout/prompts.ts';
import { FAR, box } from '../../../cutout/rules.ts';
import { cutTable } from '../../../cutout/table.ts';
import { FRAMES } from './frames.ts';

export { FRAMES };

/** A view of his, by its name in his sheet's views. */
type CutView = keyof typeof FRAMES;

/** His head above the line `line` (view pixels, right to left along his shoulders, neck and the foot of his beard), turning at `pivot`; then the rest of him. */
const bust = (line: readonly (readonly [number, number])[], pivot: readonly [number, number]) =>
  ({
    parts: [
      { name: 'head', take: [{ polygon: [[-1, -1], [FAR, -1], ...line] }], pivot },
      { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
    ],
  }) as const satisfies PartCut;

/** His bust three-quarters to the viewer's left (heads-1). */
const HEADS_1 = bust(
  [
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
  [125, 215],
);

/** His bust with his head bowed down to the viewer's left (heads-2). */
const HEADS_2 = bust(
  [
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
  [122, 225],
);

/** His bust three-quarters to the viewer's left (heads-3). */
const HEADS_3 = bust(
  [
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
  [118, 215],
);

/** His bust facing the viewer (heads-4). */
const HEADS_4 = bust(
  [
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
  [120, 222],
);

/** His bust facing the viewer, his mouth open (heads-5). */
const HEADS_5 = bust(
  [
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
  [120, 220],
);

/** His bust facing the viewer, smiling (heads-6). */
const HEADS_6 = bust(
  [
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
  [116, 222],
);

/** His sheet's ink, for the row that closes a bust's foot. */
const INK = [25, 9, 2, 255] as const;

/** What lies behind his head once it is cut away, the same in every view but for how he is turned (`turn`). */
const behindHead = (turn: string) =>
  `${CUT_AWAY} his head (his linen headcloth with its olive band and the two sides of it that hung beside his face and neck down onto his shoulders, his face and his short dark beard) was cut away to make a cut-out puppet.${turn} Repaint ONLY the magenta area, as what lies behind his head. His neck rises straight up from his collar as a plain column of skin to about where his mouth was, its two sides closed by the same thick dark brown-black outline as the rest of him, its top simply rounded and closed by the same outline (no opening, no rim, no dark band), in exactly the same skin colour, soft shading and fine paper grain as the skin of his neck below. Where the cloth hung over his shoulders, his shoulders continue as they are below it: the same linen tunic and olive mantle with its violet shade, their top edges closed by the same outline. Everywhere else in the magenta area becomes the plain cream paper. There is no head now: no headcloth, no hair, no beard, no face, no ears, nothing magenta left. ${KEEP_REST}`;

/**
 * Each view's moving parts (what a pose moves, whose areas are painted
 * magenta and repainted beneath), and the words okra repaints them by: what
 * lies under them, in the sheet's own style.
 */
const HIDDEN_ENTRIES = {
  'heads-1': {
    moving: ['head'],
    prompt: behindHead(" He is turned three-quarters to the viewer's left."),
  },
  'heads-2': {
    moving: ['head'],
    prompt: behindHead(" He is turned to the viewer's left, his head bowed."),
  },
  'heads-3': {
    moving: ['head'],
    prompt: behindHead(" He is turned three-quarters to the viewer's left."),
  },
  'heads-4': { moving: ['head'], prompt: behindHead(' He faces the viewer.') },
  'heads-5': { moving: ['head'], prompt: behindHead(' He faces the viewer.') },
  'heads-6': { moving: ['head'], prompt: behindHead(' He faces the viewer.') },
} as const satisfies Readonly<Record<CutView, HiddenEntry>>;

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
