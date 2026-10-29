// The villager toddler's kept views cut into parts (`cutParts`, @manna/film's
// part sheet): each part their own pixels, front to back, so that a part can
// move while every pixel at rest stays the sheet's. Parts are named from their
// own side: `armLeft` is their left arm. They have no rig, so no part labels:
// the round hand lies inside the sleeve's polygon whole, so no piece of it
// stays behind when the arm moves. The cuts the sheet does not ink (the
// sleeve's root, a crease; the neck under the chin; the hem; each sandal) are
// polygons read off the view's ink and skin columns. Their head is the rows
// above their chin and neck; a torso strip parts it from the sleeve's corner,
// so the paint okra lays under the sleeve's root has torso behind it, never
// head. Below the hem the sandals, each its top on the hem's lowest row and
// its foot at its sole's ink, and the ground shadow behind them is a part of
// its own. Each view names the parts a pose moves, and the words okra repaints
// what they hide by (`HIDDEN`, read by `film concept parts`, which writes
// `sheets/<view>/`). The lines are read in the kept view's pixels; the shared
// cut table (`library/cutout/table.ts`) lays them in each view's part sheet
// frame, its kept box padded (`frames.ts`). Data: the rules and the table are
// the shared module's.

import type { HiddenEntry, PartCut } from '@manna/film/tools';
import { CUT_AWAY, grain } from '../../../cutout/prompts.ts';
import { FAR, type SoleRuns, underSole } from '../../../cutout/rules.ts';
import { cutTable } from '../../../cutout/table.ts';
import { FRAMES } from './frames.ts';
import { JOINTS } from './joints.ts';

export { FRAMES, JOINTS };

/** A view of theirs, by its name in their sheets' views. */
type CutView = keyof typeof FRAMES;

/**
 * Running towards the viewer's left, leaning forward, on their kept poses
 * sheet: the big bald head with its tuft at the top left, the ear at about
 * x120-135, y65-100. Only their left arm, the near one, shows: its sleeve
 * leaves their body under the ear (the root a crease with no ink, x148-164)
 * and runs out level behind them to the round hand at the view's right edge
 * (ring x195-241, y86-130); the sleeve's lower ink runs y148-157 (x164-214).
 * Right of x154 and above y158 every pixel is the arm's or paper. The lead
 * foot is at the bottom left, its sole lowest on y285; the back foot, heel up,
 * at the right, its sole lowest on y282. The hem's lowest ink rises from y267
 * (x115-145) to y255 at its right end (x185) and to y235 over the lead foot.
 */
const P1_HEM = [
  [-1, 236],
  [38, 236],
  [44, 239],
  [55, 240],
  [60, 244],
  [65, 249],
  [72, 253],
  [76, 258],
  [80, 258],
  [90, 263],
  [100, 265],
  [110, 267],
  [120, 268],
  [145, 268],
  [155, 266],
  [165, 265],
  [175, 262],
  [180, 259],
  [186, 256],
] as const;
/** Each sole's lowest ink, by columns (measured). */
const P1_SOLES = {
  left: [
    [8, 12, 249],
    [13, 17, 256],
    [18, 22, 262],
    [23, 27, 268],
    [28, 32, 273],
    [33, 37, 278],
    [38, 42, 283],
    [43, 50, 285],
    [51, 52, 284],
    [53, 57, 281],
    [58, 62, 275],
    [63, 67, 268],
    [68, 72, 264],
  ],
  right: [
    [188, 192, 270],
    [193, 197, 277],
    [198, 201, 280],
    [202, 213, 282],
    [214, 217, 280],
    [218, 222, 277],
    [223, 228, 271],
  ],
} as const satisfies Readonly<Record<string, SoleRuns>>;

const POSES_1: PartCut = {
  parts: [
    // right of the root's crease (x154) and above the sleeve's lower ink (1-2 px past it), the hand's whole ring inside
    {
      name: 'armLeft',
      take: [
        {
          polygon: [
            [154, -1],
            [FAR * 2, -1],
            [FAR * 2, 160],
            [182, 160],
            [178, 158],
            [164, 158],
            [154, 150],
          ],
        },
      ],
      pivot: JOINTS['poses-1'].shoulderLeft,
    },
    // above the chin's and the neck's lowest ink and skin, left of x148: the strip x148-154 over the sleeve's corner, and the chin's line where it meets the sleeve's top, are torso's
    {
      name: 'head',
      take: [
        {
          polygon: [
            [-1, -1],
            [148, -1],
            [148, 94],
            [146, 100],
            [144, 110],
            [140, 111],
            [136, 112],
            [130, 113],
            [124, 115],
            [118, 118],
            [114, 121],
            [110, 127],
            [106, 133],
            [102, 141],
            [98, 148],
            [90, 150],
            [78, 148],
            [72, 145],
            [30, 141],
            [24, 141],
            [18, 137],
            [12, 131],
            [-1, 122],
          ],
        },
      ],
    },
    {
      name: 'footLeft',
      take: [{ polygon: [...P1_HEM.slice(0, 7), [72, FAR * 2], [-1, FAR * 2]] }],
      unless: [underSole(P1_SOLES.left)],
    },
    {
      name: 'footRight',
      take: [
        {
          polygon: [
            [188, 190],
            [FAR * 2, 190],
            [FAR * 2, FAR * 2],
            [188, FAR * 2],
          ],
        },
      ],
      unless: [underSole(P1_SOLES.right)],
    },
    {
      name: 'shadow',
      take: [
        {
          polygon: [...P1_HEM, [188, 190], [FAR * 2, 190], [FAR * 2, FAR * 2], [-1, FAR * 2]],
        },
      ],
    },
    {
      name: 'torso',
      take: [
        {
          polygon: [
            [-1, -1],
            [FAR * 2, -1],
            [FAR * 2, FAR * 2],
            [-1, FAR * 2],
          ],
        },
      ],
    },
  ],
};

/**
 * Their outline is [29, 14, 5] (measured); a framed cut reads no ink, so
 * their poses take none.
 */
const INK = [29, 14, 5, 255] as const;

/** The paper grain their sheet shows on their body, carried into the paint under the arm. */
const GRAIN = grain('the linen tunic of their body');

/**
 * Each view's moving parts (what a pose moves, whose areas are painted
 * magenta and repainted beneath), and the words okra repaints them by: what
 * lies under them, in the sheet's own style. The shared prompt sentences take
 * `his` or `her`, so their sides and shade are written here with `their`.
 */
const HIDDEN_ENTRIES = {
  'poses-1': {
    moving: ['armLeft'],
    prompt: `${CUT_AWAY} their left arm (its sleeve and round hand) was cut away to make a cut-out puppet. The toddler is seen from the side, running towards the viewer's left and leaning forward, and their other arm does not show: their left arm was stretched out level behind them, from their shoulder under the ear to the round hand at the right edge, over the plain paper. Repaint ONLY the magenta areas, as what lies underneath the arm: their back, from behind their neck down to the tunic, closed by the same thick dark brown-black outline as the rest of them, painted in exactly the same style, colours and soft shading as their body beside the arm (the cream linen tunic, and the soft lavender shade of its far side below the arm). Their back runs down from their neck in one smooth curve to the tunic's back edge: out to their shoulder and tunic, not in at the sleeve's edge. Shade with colour, as the sheet does: the side away from the light in the soft lavender, never grey or black. ${GRAIN} There is no arm now: no sleeve, no hand, nothing magenta left. Where the magenta lay outside their body, it becomes the plain cream paper. Keep every other pixel exactly as it is: the same head, tuft of hair, ear, face, tunic, legs, sandals, ground shadow, size, position and framing.`,
  },
} as const satisfies Readonly<Record<CutView, HiddenEntry>>;

/** Their cut table: each view's cut and how its figure is read. */
export const { CUTS, cutOptionsFor, HIDDEN } = cutTable({
  frames: FRAMES,
  views: {
    'poses-1': { cut: POSES_1, figure: 'framed' },
  },
  hidden: HIDDEN_ENTRIES,
  ink: INK,
});
