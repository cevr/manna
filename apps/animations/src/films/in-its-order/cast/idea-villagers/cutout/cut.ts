// The IDEA villagers' kept views cut into parts (`cutParts`, @manna/film's part
// sheet): each part the figure's own pixels, front to back, so that a part can
// move while every pixel at rest stays the sheet's. Parts are named from the
// figure's own side: `armRight` is his right arm, on the viewer's left from in
// front. Each arm is its sleeve's own outline and its round hand (a disc), taken
// first; the head is the rows above the chin, the robe every row from the hip
// down that the arms leave, and the torso the rest, the headcloth that hangs
// over the shoulders with it. Each view names the parts a pose moves, and the
// words okra repaints what they hide by (`HIDDEN`, read by `film concept
// parts`, which writes `sheets/<view>/`). The lines are read in the kept view's
// pixels; the shared cut table (`library/cutout/table.ts`) lays them in each
// view's part sheet frame. Data: the rules and the table are the library's.

import type { HiddenEntry, PartCut } from '@manna/film/tools';
import { CUT_AWAY, grain, shade, sides } from '../../../../../library/cutout/prompts.ts';
import { FAR, box } from '../../../../../library/cutout/rules.ts';
import { cutTable } from '../../../../../library/cutout/table.ts';
import { FRAMES } from './frames.ts';
import { JOINTS } from './joints.ts';

export { FRAMES, JOINTS };

/** A view of theirs, by its name in their sheet's views. */
type CutView = keyof typeof FRAMES;

// The poses-3 box reaches into the poses-4 baby's own box: his head lies at the
// box's bottom right, below the man's reaching arm and right of his tunic's
// edge. The cutter refuses a figure pixel no part takes, so a first, still part
// takes those pixels; the puppet leaves it out of its parts, so the render draws
// no figure but the man.
const POSES_3: PartCut = {
  parts: [
    // the poses-4 baby's head inside this box: not the man's, and never drawn
    { name: 'neighbour', take: [box(270, 300, FAR, FAR)] },
    // his left arm reaching out to the viewer's right, its hand open at the end
    {
      name: 'armLeft',
      take: [
        { disc: { c: [318, 170], r: 28 } },
        {
          polygon: [
            [210, 168],
            [225, 150],
            [300, 140],
            [300, 232],
            [240, 230],
            [205, 240],
            [195, 205],
          ],
        },
      ],
      pivot: JOINTS['poses-3'].shoulderLeft,
    },
    // his right arm hanging on the viewer's left, below his headcloth
    {
      name: 'armRight',
      take: [
        { disc: { c: [25, 240], r: 26 } },
        {
          polygon: [
            [-1, 175],
            [90, 175],
            [95, 215],
            [80, 262],
            [50, 272],
            [-1, 272],
          ],
        },
      ],
      pivot: JOINTS['poses-3'].shoulderRight,
    },
    // above his chin: the headcloth's top, his face and beard
    { name: 'head', take: [box(-1, -1, FAR, 168)] },
    { name: 'robe', take: [box(-1, 290, FAR, FAR)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
};

// The baby sits with his knees up and his hands between them: each arm runs
// from its shoulder under his chin down to its hand, inside the knee.
const POSES_4: PartCut = {
  parts: [
    {
      name: 'armRight',
      take: [
        {
          polygon: [
            [30, 128],
            [58, 128],
            [84, 148],
            [84, 184],
            [52, 184],
            [36, 150],
          ],
        },
      ],
      pivot: JOINTS['poses-4'].shoulderRight,
    },
    {
      name: 'armLeft',
      take: [
        {
          polygon: [
            [114, 128],
            [142, 128],
            [134, 150],
            [132, 184],
            [90, 184],
            [90, 148],
          ],
        },
      ],
      pivot: JOINTS['poses-4'].shoulderLeft,
    },
    // above his chin: his round head and its tuft
    { name: 'head', take: [box(-1, -1, FAR, 128)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
};

// Standing facing the viewer: each sleeve runs from under the headcloth to its
// round hand, its inner edge the soft crease the sheet paints without ink.
const POSES_6: PartCut = {
  parts: [
    {
      name: 'armRight',
      take: [
        { disc: { c: [25, 322], r: 24 } },
        {
          polygon: [
            [-1, 178],
            [48, 178],
            [50, 305],
            [-1, 305],
          ],
        },
      ],
      pivot: JOINTS['poses-6'].shoulderRight,
    },
    {
      name: 'armLeft',
      take: [
        { disc: { c: [180, 322], r: 24 } },
        {
          polygon: [
            [158, 178],
            [FAR, 178],
            [FAR, 305],
            [156, 305],
          ],
        },
      ],
      pivot: JOINTS['poses-6'].shoulderLeft,
    },
    // above his chin: the headcloth's top, his face and beard
    { name: 'head', take: [box(-1, -1, FAR, 150)] },
    { name: 'robe', take: [box(-1, 300, FAR, FAR)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
};

/** Their sheet's outline ink (measured on each view: 5,1,0 to 6,2,0). */
const INK = [6, 1, 0, 255] as const;

/** Where the grown villager's body runs under his arms: out to his shoulders and tunic, not in at the sleeves' inner edges. */
const SIDES = sides({
  pronoun: 'his',
  lower: 'tunic',
  cloth: 'the undyed linen tunic and its soft folds',
});

/** The paper grain the sheet shows on his tunic, carried into the paint under his arms. */
const GRAIN = grain('the linen tunic of his body');

/** What every view of the grown villager keeps as it is. */
const KEEP = `Keep every other pixel exactly as it is: the same linen headcloth and its band, face, beard, tunic, sandals, size, position and framing.`;

/**
 * Each view's moving parts (what a pose moves, whose areas are painted
 * magenta and repainted beneath), and the words okra repaints them by: what
 * lies under them, in the sheet's own style. The poses-3 neighbour is still,
 * so nothing is repainted under it.
 */
const HIDDEN_ENTRIES = {
  'poses-3': {
    moving: ['armRight', 'armLeft'],
    prompt: `${CUT_AWAY} his two arms (linen sleeves and round hands) were cut away to make a cut-out puppet. He is a plain villager in an undyed linen tunic to the shins, a linen headcloth tied with a walnut band and a short dark beard, hopping on one foot. Repaint ONLY the magenta areas, as what lies underneath his arms: the sides of his body below the headcloth, down to his tunic, each side closed by the same thick dark brown-black outline as the rest of him, painted in exactly the same style, colours and soft shading as his tunic beside each arm. ${SIDES} ${shade('his')} ${GRAIN} There are no arms now: no sleeves, no hands, nothing magenta left. Where the magenta lay outside his body, it becomes the plain cream paper. ${KEEP}`,
  },
  'poses-4': {
    moving: ['armRight', 'armLeft'],
    prompt: `${CUT_AWAY} his two small arms (sleeves of his wrap and round hands) were cut away to make a cut-out puppet. He is a baby sitting with his knees up, wrapped in plain linen, a small tuft on his round head. Repaint ONLY the magenta areas, as what lies underneath his arms: his chest and the wrap over his lap between his knees, closed by the same thick dark brown-black outline as the rest of him, painted in exactly the same style, colours and soft shading as the wrap beside each arm. ${shade('his')} ${grain('the linen wrap of his body')} There are no arms now: no sleeves, no hands, nothing magenta left. Where the magenta lay outside his body, it becomes the plain cream paper. Keep every other pixel exactly as it is: the same head, face, knees, feet, size, position and framing.`,
  },
  'poses-6': {
    moving: ['armRight', 'armLeft'],
    prompt: `${CUT_AWAY} his two arms (linen sleeves and round hands) were cut away to make a cut-out puppet. He is a plain villager in an undyed linen tunic to the shins, a linen headcloth tied with a walnut band and a short dark beard, standing facing the viewer with his arms hanging at his sides. Repaint ONLY the magenta areas, as what lies underneath his arms: the sides of his body below the headcloth, down to his tunic, each side closed by the same thick dark brown-black outline as the rest of him, painted in exactly the same style, colours and soft shading as his tunic beside each arm. ${SIDES} ${shade('his')} ${GRAIN} There are no arms now: no sleeves, no hands, nothing magenta left. Where the magenta lay outside his body, it becomes the plain cream paper. ${KEEP}`,
  },
} as const satisfies Readonly<Record<CutView, HiddenEntry>>;

export const { CUTS, cutOptionsFor, HIDDEN } = cutTable({
  frames: FRAMES,
  views: {
    'poses-3': { cut: POSES_3, figure: 'framed' },
    'poses-4': { cut: POSES_4, figure: 'framed' },
    'poses-6': { cut: POSES_6, figure: 'framed' },
  },
  hidden: HIDDEN_ENTRIES,
  ink: INK,
});
