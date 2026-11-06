import type { HiddenEntry, PartCut } from '@manna/film/tools';
import { CUT_AWAY, KEEP_REST } from '../../../../../library/cutout/prompts.ts';
import { FAR, box } from '../../../../../library/cutout/rules.ts';
import { cutTable } from '../../../../../library/cutout/table.ts';
import { FRAMES } from './frames.ts';

export { FRAMES };

/** The kept view's row (its px) across his headcloth's two hanging sides just above his mantle's shoulders: the head part is everything above it but his neck. */
const DRAPE_CUT = 237;

/**
 * The guest man's seated `neutral` key at the table cut into two parts,
 * front to back, in the kept view's px (the cell's px less 2 across and 161
 * down): his head (the headcloth and its band, his hair, face, ears and the
 * jaw's line) above a cut across the headcloth's hanging sides and under his
 * jaw, on the root of his neck; and his body, the rest (the neck, the
 * headcloth's hanging ends on his shoulders, the mantle, the robe, the hands,
 * the stool and the feet), still.
 */
const SINGLE_1: PartCut = {
  parts: [
    {
      name: 'head',
      take: [
        {
          polygon: [
            [-1, -1],
            [FAR, -1],
            [FAR, DRAPE_CUT],
            [213, DRAPE_CUT],
            [203, 241],
            [188, 249],
            [178, 253],
            [158, 254],
            [138, 251],
            [128, 243],
            [118, DRAPE_CUT],
            [-1, DRAPE_CUT],
          ],
        },
      ],
      pivot: [165, 267],
    },
    { name: 'body', take: [box(-1, -1, FAR, FAR)], pivot: [173, 640] },
  ],
};

/** What his head hides, as okra repaints it under it. */
const HIDDEN_ENTRIES = {
  'single-1': {
    moving: ['head'],
    prompt: `${CUT_AWAY} one piece was cut away to make a cut-out puppet of this man seated on a wooden stool: his head with his whole linen headcloth and its indigo band, down to just above his shoulders. Repaint ONLY the magenta areas, as what lies underneath that piece. Behind his head: his neck rising straight up from his collar as a plain column of skin to about where his mouth was, its two sides closed by the same thick dark brown-black outline as the rest of him, its top simply rounded and closed by the same outline, in exactly the same skin colour as his neck below. Above each of the two hanging ends of the headcloth on his shoulders: the same pale cloth continued straight up a short way, about the width of a finger, with the same thick dark outline on its outer edge and its colours unchanged, ending in a plain flat top. There is no head and no headcloth above that now: nothing magenta left. Everywhere else the magenta becomes the plain cream paper. ${KEEP_REST}`,
  },
} as const satisfies Readonly<Record<keyof typeof FRAMES, HiddenEntry>>;

/** His ink, for the cut table's bust reading (unused: his view is framed). */
const INK = [21, 12, 7, 255] as const;

/** His cut table: the one view, framed, read with no labels. */
export const { CUTS, cutOptionsFor, HIDDEN, GAPS, paperOf } = cutTable({
  frames: FRAMES,
  views: {
    'single-1': {
      cut: SINGLE_1,
      figure: 'framed',
      gaps: [],
    },
  },
  hidden: HIDDEN_ENTRIES,
  ink: INK,
});
