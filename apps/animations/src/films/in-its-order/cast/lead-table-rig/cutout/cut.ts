import type { HiddenEntry, PartCut } from '@manna/film/tools';
import { CUT_AWAY, KEEP_REST } from '../../../../../library/cutout/prompts.ts';
import { FAR, box } from '../../../../../library/cutout/rules.ts';
import { cutTable } from '../../../../../library/cutout/table.ts';
import { FRAMES } from './frames.ts';

export { FRAMES };

/**
 * The lead's seated `bottle` key at the table cut into five parts, front to
 * back, in the kept view's px (the cell's px less 15 across and 210 down):
 * his raised left arm (the viewer's right: the sleeve, the round hand and
 * the bottle) on its elbow at the sleeve's foot; his hanging right arm (the
 * viewer's left, its hand on his knee) on its shoulder; the sash's hanging
 * end on the knot; his head (hair, face, ears and the chin's ink) on his
 * neck under the chin; and his body, the rest (the neck, the tunic and
 * mantle, his lap, the stool and his feet).
 */
const SINGLE_1: PartCut = {
  parts: [
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
            [172.5, 200],
            [172.5, 306],
            [FAR, 306],
            [FAR, 78],
          ],
        },
      ],
      pivot: [200, 295],
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
      name: 'clothSash',
      take: [
        {
          polygon: [
            [87, 347],
            [132, 347],
            [132, 432],
            [130, 516],
            [93, 516],
            [91, 432],
            [87, 390],
          ],
        },
      ],
      pivot: [108, 346],
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
    { name: 'body', take: [box(-1, -1, FAR, FAR)] },
  ],
};

/** What the four moving parts hide, as okra repaints it under them into his body. */
const HIDDEN_ENTRIES = {
  'single-1': {
    moving: ['armLeft', 'armRight', 'clothSash', 'head'],
    prompt: `${CUT_AWAY} four pieces were cut away to make a cut-out puppet of this young man seated on a wooden stool: his head (his hair, face and ears), his raised left arm on the viewer's right (its teal-blue sleeve, its round hand and the baby bottle it holds up), his hanging right arm on the viewer's left (its cream sleeve and the round hand resting on his knee), and the hanging end of his cream sash below the knot. Repaint ONLY the magenta areas, as what lies underneath those pieces. Behind his head: his neck rising straight up from his collar as a plain column of skin to about where his mouth was, its two sides closed by the same thick dark brown-black outline as the rest of him, its top simply rounded and closed by the same outline, in exactly the same skin colour and soft shading as his neck below. Under each arm: the side of his body from the shoulder and armpit down to the sash and his lap, closed by the same thick dark outline, in exactly the same colours and soft shading (the cream tunic on the viewer's left side, the teal-blue mantle over his left shoulder on the viewer's right side), and his lap running on under where his hand rested. Under the sash's hanging end: the teal-blue mantle and the cream tunic of his lap running on exactly as they do on each side of it, the lap's dark outline running straight on across. There is no head, no arms, no bottle and no hanging sash end now: nothing magenta left. Where the magenta lay outside his body, beside his neck, his shoulders and his arms, it becomes the plain cream paper. ${KEEP_REST}`,
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
