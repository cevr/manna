import type { HiddenEntry, PartCut } from '@manna/film/tools';
import { CUT_AWAY, KEEP_REST } from '../../../../../library/cutout/prompts.ts';
import { FAR, box } from '../../../../../library/cutout/rules.ts';
import { cutTable } from '../../../../../library/cutout/table.ts';
import { FRAMES } from './frames.ts';

export { FRAMES };

/** The kept view's row (its px) just under his belt's lower outline: his torso above it breathes about it, his lap below it stays. */
const WAIST = 346;

/**
 * The lead's seated `bottle` key at the table cut into six parts, front to
 * back, in the kept view's px (the cell's px less 15 across and 210 down):
 * the raised sleeve's hanging lower curve below its elbow, on the sleeve; his
 * raised left arm (the viewer's right: the sleeve, the round hand and the
 * bottle) on his shoulder, its cut run on the mantle left of the sleeve's
 * inner outline so the whole outline and its junction with the shoulder ride
 * the arm; his hanging right arm (the viewer's left, its hand on his knee) on
 * its shoulder; his head (hair, face, ears and the chin's ink) on his neck
 * under the chin; his lap below his belt (the hanging sash, his knees, the
 * stool and his feet); and his torso, the rest (the neck, the tunic and the
 * mantle down to his belt), on his belt's middle.
 */
const SINGLE_1: PartCut = {
  parts: [
    {
      name: 'clothSleeve',
      take: [
        {
          polygon: [
            [165, 258],
            [FAR, 258],
            [FAR, 310],
            [174, 310],
            [174, 290],
            [165, 284],
          ],
        },
      ],
      pivot: [200, 258],
    },
    {
      name: 'armLeft',
      take: [
        {
          polygon: [
            [186, 78],
            [186, 115],
            [180.5, 125],
            [179, 150],
            [170, 172],
            [166, 190],
            [165, 200],
            [165, 258],
            [FAR, 258],
            [FAR, 78],
          ],
        },
      ],
      pivot: [175, 212],
    },
    {
      name: 'armRight',
      take: [
        {
          polygon: [
            [-1, 185],
            [43, 185],
            [47, 202],
            [51, 256],
            [59, 318],
            [69, 372],
            [75, 390],
            [-1, 390],
          ],
        },
        { disc: { c: [48, 401], r: 32 } },
      ],
      pivot: [40, 230],
    },
    {
      name: 'head',
      take: [
        {
          polygon: [
            [-1, -1],
            [FAR, -1],
            [FAR, 180],
            [152, 180],
            [142, 187],
            [135, 191],
            [125, 194],
            [110, 195],
            [95, 195],
            [85, 193],
            [74, 189],
            [66, 182],
            [-1, 182],
          ],
        },
      ],
      pivot: [105, 194],
    },
    { name: 'lap', take: [box(-1, WAIST, FAR, FAR)] },
    { name: 'body', take: [box(-1, -1, FAR, FAR)], pivot: [108, WAIST] },
  ],
};

/** What the three moving parts hide, as okra repaints it under them into his torso. */
const HIDDEN_ENTRIES = {
  'single-1': {
    moving: ['clothSleeve', 'armLeft', 'head'],
    prompt: `${CUT_AWAY} two pieces were cut away to make a cut-out puppet of this young man seated on a wooden stool: his head (his hair, face and ears), and his raised left arm on the viewer's right (its whole teal-blue sleeve from the shoulder down to the elbow's lower curve, its round hand and the baby bottle it holds up). Repaint ONLY the magenta areas, as what lies underneath those pieces. Behind his head: his neck rising straight up from his collar as a plain column of skin to about where his mouth was, its two sides closed by the same thick dark brown-black outline as the rest of him, its top simply rounded and closed by the same outline, in exactly the same skin colour and soft shading as his neck below. Under the raised arm: the side of his body from the shoulder and armpit down to his belt, closed by the same thick dark outline, in exactly the same teal-blue of the mantle over his left shoulder and its soft shading. There is no head, no raised arm and no bottle now: nothing magenta left. Where the magenta lay outside his body, beside his neck, his shoulder and his raised arm, it becomes the plain cream paper. ${KEEP_REST}`,
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
      gaps: [
        {
          at: [160, 180],
          box: [133, 142, 177, 210],
          why: 'the ground between his ear, his chin, his shoulder and the raised arm',
        },
        {
          at: [42, 560],
          box: [35, 550, 49, 571],
          why: "the ground between the stool's left leg and his right sandal",
        },
        {
          at: [175, 560],
          box: [170, 551, 181, 568],
          why: "the ground between his left sandal and the stool's right leg",
        },
      ],
    },
  },
  hidden: HIDDEN_ENTRIES,
  ink: INK,
});
