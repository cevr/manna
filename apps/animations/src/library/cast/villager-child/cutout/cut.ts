// How the villager child is cut into parts, one table per cut view, in view
// pixels (x right, y down, the kept box's origin): his kept pose writing on a
// board (poses-5), three-quarters to the viewer's right, his near right arm
// hanging on the viewer's left and his far left arm raised to the viewer's
// right, the chalk in its round hand. Neither sleeve has ink between it and
// the tunic, so each root is cut along its shade crease. Two strips of torso
// part the head from each sleeve's corner, so the paint laid under a sleeve
// beside the head falls in torso, never head. Pure data.

import type { HiddenEntry, PartCut } from '@manna/film/tools';
import { CUT_AWAY, grain, shade, sides } from '../../../cutout/prompts.ts';
import { FAR, box } from '../../../cutout/rules.ts';
import { cutTable } from '../../../cutout/table.ts';
import { FRAMES } from './frames.ts';
import { JOINTS } from './joints.ts';

export { FRAMES, JOINTS };

const POSES_5: PartCut = {
  parts: [
    {
      name: 'armRight',
      // the shoulder's top ink (x63-84, y148), 3 px outside the outer knots down to the cuff (x21-63, y252), the inner side on the shade crease (x68-76, y200-250); the hand ring (x22-70, y252-300) in its disc
      take: [
        {
          polygon: [
            [50, 154],
            [60, 144],
            [88, 144],
            [82, 170],
            [78, 200],
            [77, 250],
            [72, 256],
            [16, 256],
            [17, 244],
            [20, 236],
            [22, 228],
            [24, 220],
            [27, 212],
            [29, 204],
            [32, 196],
            [35, 188],
            [38, 180],
            [41, 172],
            [45, 164],
          ],
        },
        { disc: { c: [46, 276], r: 26 } },
      ],
      pivot: JOINTS['poses-5'].shoulderRight,
    },
    {
      name: 'head',
      // hair, face and chin down to the chin's ink (y140), the hair beside the near shoulder to y152; about 10 px short of the raised sleeve's upper ink, the strip torso's
      take: [
        {
          polygon: [
            [-1, -1],
            [168, -1],
            [168, 72],
            [160, 82],
            [152, 90],
            [146, 96],
            [140, 104],
            [136, 112],
            [135, 124],
            [128, 141],
            [48, 141],
            [44, 152],
            [-1, 152],
          ],
        },
      ],
    },
    {
      name: 'armLeft',
      // 3 px outside the sleeve's upper ink (y88-120) and lower ink (y120-192), round the hand ring with its chalk and fingertip (x174-226, y52-116), the root on the S crease (x137-150, y160-184) up to the face outline
      take: [
        {
          polygon: [
            [146, 114],
            [152, 103],
            [157, 97],
            [161, 92],
            [165, 88],
            [172, 84],
            [176, 66],
            [196, 50],
            [206, 47],
            [218, 48],
            [230, 62],
            [231, 108],
            [220, 119],
            [209, 122],
            [209, 128],
            [213, 136],
            [215, 144],
            [209, 153],
            [200, 161],
            [191, 169],
            [181, 177],
            [170, 185],
            [159, 193],
            [155, 198],
            [150, 184],
            [143, 172],
            [138, 160],
            [140, 140],
            [145, 125],
          ],
        },
      ],
      pivot: JOINTS['poses-5'].shoulderLeft,
    },
    { name: 'torso', take: [box(-1, -1, FAR, FAR * 2)] },
  ],
};

/** His ink line (r+g+b < 120, median, measured). */
const INK = [29, 14, 5, 255] as const;

/** How okra closes his body's sides where his arms lay. */
const SIDES = sides({ pronoun: 'his', lower: 'tunic', cloth: 'the linen tunic' });

/** The paper grain his sheet shows on his body, carried into the paint under his arms. */
const GRAIN = grain('the linen tunic of his body');

/**
 * Each view's moving parts (what a pose moves, whose areas are painted
 * magenta and repainted beneath), and the words okra repaints them by: what
 * lies under them, in the sheet's own style.
 */
const HIDDEN_ENTRIES = {
  'poses-5': {
    moving: ['armRight', 'armLeft'],
    prompt: `${CUT_AWAY} his two arms (sleeves and round hands) were cut away to make a cut-out puppet. He is a young boy turned three-quarters to the viewer's right, standing: his right arm hung at his side on the viewer's left, and his left arm was raised to the viewer's right at shoulder height, writing with a stub of white chalk. Repaint ONLY the magenta areas, as what lies underneath his arms: the sides of his body, from each armpit down to the tunic, each side closed by the same thick dark brown-black outline as the rest of him, painted in exactly the same style, colours and soft shading as his body beside each arm (the cream linen tunic and his body's front outline on the viewer's left side; the cream linen tunic, its soft lavender shaded far side and his back's outline on the viewer's right side, below his neck). ${SIDES} ${shade('his')} ${GRAIN} There are no arms now: no sleeves, no hands, no chalk, nothing magenta left. Where the magenta lay outside his body, it becomes the plain cream paper. Keep every other pixel exactly as it is: the same dark hair, face, neck, tunic, sandals, ground shadow, size, position and framing.`,
  },
} as const satisfies Readonly<Record<'poses-5', HiddenEntry>>;

export const { CUTS, cutOptionsFor, HIDDEN } = cutTable({
  frames: FRAMES,
  views: { 'poses-5': { cut: POSES_5, figure: 'framed' } },
  hidden: HIDDEN_ENTRIES,
  ink: INK,
});
