import type { HiddenEntry } from '@manna/film/tools';
import { bustCut } from '../../../cutout/bust.ts';
import { CUT_AWAY, KEEP_REST } from '../../../cutout/prompts.ts';
import { FAR } from '../../../cutout/rules.ts';
import { cutTable } from '../../../cutout/table.ts';
import { FRAMES, type FramedView } from './frames.ts';

export { FRAMES };

/**
 * The grown man facing the viewer (poses-1): his face's skin ends at row 222
 * all across his chin, and both junctions are narrowest there (the left at
 * x 111, its stub's inner end at 125; the right at 192, its stub's at 178), so
 * the line is level below it. He turns at his neck's centre.
 */
const POSES_1 = bustCut({
  line: [
    [FAR, 223],
    [-1, 223],
  ],
  pivot: [151, 223],
});

/**
 * The grown woman (poses-2): her chin's edge rises to the viewer's right (row
 * 219 at x 140, 218 at 150, 216 at 160), her left junction is narrowest at
 * row 219 (its stub's inner end at x 117), and her right junction's stub ends
 * at x 164, where her dark hair tie meets it. The tie hangs at the viewer's
 * right and meets her shoulder's outline at (200, 231), so the line runs from
 * there up its inner side to the junction, and on along her chin.
 */
const POSES_2 = bustCut({
  line: [
    [FAR, 231],
    [200, 231],
    [164, 224],
    [164, 216],
    [160, 216],
    [150, 218],
    [140, 219],
    [117, 220],
    [-1, 220],
  ],
  pivot: [140, 219],
});

/**
 * The older man (poses-3): his face's skin ends at row 219 all across his
 * chin, and both junctions are narrowest there (the left 111-124, the right
 * 176-190), so the line is level below it, his pivot midway between the
 * stubs' inner ends.
 */
const POSES_3 = bustCut({
  line: [
    [FAR, 220],
    [-1, 220],
  ],
  pivot: [150, 220],
});

/**
 * The older woman (poses-4): her chin's edge rises to the viewer's right (row
 * 220 at x 140, 219 at 150, 217 at 160), her right junction is narrowest on
 * rows 218-219 (its stub's inner end at x 165) and her left on rows 219-220
 * (at 117). Her bun sits at the viewer's right, outside the right junction,
 * its outline closing on her shoulder's at (207, 232), so the line runs from
 * there up the shoulder's outline to the junction, and on along her chin.
 */
const POSES_4 = bustCut({
  line: [
    [FAR, 232],
    [207, 232],
    [165, 219],
    [165, 217],
    [160, 217],
    [150, 219],
    [140, 220],
    [-1, 220],
  ],
  pivot: [141, 220],
});

/** The sheet's outline ink, for the row that closes a bust's foot (about 16,4,0, as on the feast's guest man's sheet). */
const INK = [16, 4, 0, 255] as const;

/**
 * A base's hidden entry: only the head moves, so the torso stays and nothing
 * is repainted under it, and what lies behind the head is the neck. The words
 * follow the shared bust's (`library/cutout/bust.ts`) with the base's own
 * pronoun; `turn` is a sentence with its leading space.
 */
const behindHead = (pronoun: 'his' | 'her', head: string, turn: string): HiddenEntry => ({
  moving: ['head'],
  prompt: `${CUT_AWAY} ${pronoun} head (${head}) was cut away to make a cut-out puppet.${turn} Repaint ONLY the magenta area, as what lies behind ${pronoun} head: ${pronoun} neck rising from ${pronoun} collar as a plain column of skin to about where the mouth was, its two sides closed by the same thick dark brown-black outline as the rest of the figure, its top simply rounded and closed by the same outline, in exactly the same skin colour and soft shading as the neck below. Everywhere else in the magenta area becomes the plain cream paper. There is no head now: no hair, no face, no ears, nothing magenta left. ${KEEP_REST}`,
});

/** Each view's hidden entry, in the words `film concept parts` would repaint by. */
const HIDDEN_ENTRIES = {
  'poses-1': behindHead('his', 'his dark hair, face and ears', ' He faces the viewer.'),
  'poses-2': behindHead(
    'her',
    'her dark hair, its tie hanging at her left, her face and ears',
    ' She faces the viewer.',
  ),
  'poses-3': behindHead('his', 'his pale hair, face and ears', ' He faces the viewer.'),
  'poses-4': behindHead(
    'her',
    'her pale hair, its bun at her left, her face and ears',
    ' She faces the viewer.',
  ),
} as const satisfies Readonly<Record<FramedView, HiddenEntry>>;

/** Their cut table: each view's cut and how its figure is read. */
export const { CUTS, cutOptionsFor, HIDDEN, paperOf } = cutTable({
  frames: FRAMES,
  views: {
    'poses-1': { cut: POSES_1, figure: 'bust' },
    'poses-2': { cut: POSES_2, figure: 'bust' },
    'poses-3': { cut: POSES_3, figure: 'bust' },
    'poses-4': { cut: POSES_4, figure: 'bust' },
  },
  hidden: HIDDEN_ENTRIES,
  ink: INK,
});
