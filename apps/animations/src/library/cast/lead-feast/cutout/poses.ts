// The series lead's fitted poses (`film concept fit`, `poses/<kind>-<view>.json`):
// each kept pose view's body as the better of his front and threeQuarterLeft
// puppets fits it, and the drawings the raise lays (`raise/`): the pose
// view's own raised arm in place of his `armRight` and its hand with the
// bottle held, each laid where the pose view draws it (the shared `fitted`
// form, `library/cutout/poses.ts`). The rows the fit cannot pass are named
// with why (`NAMED`). Pure data.

import { fitted } from '../../../cutout/poses.ts';
import heldPoses1 from './raise/held/poses-1.png' with { type: 'file' };
import raised from './raise/keys/raised.png' with { type: 'file' };
import RAISE_JSON from './raise/record.json' with { type: 'json' };
import POSES1_JSON from './poses/poses-poses-1.json' with { type: 'json' };
import { PUPPETS } from './puppets.ts';

/** poses-1, fitted from his front or threeQuarterLeft puppet; the line is left as the drawings draw it 42 sheet px round the held hand (the raise's). */
const POSES1 = fitted({
  view: 'poses-1',
  puppets: { front: PUPPETS.front, threeQuarterLeft: PUPPETS.threeQuarterLeft },
  fit: POSES1_JSON,
  raise: RAISE_JSON,
  swap: { part: 'armRight', drawing: 'raised', png: raised },
  held: heldPoses1,
  quiet: 42,
});

/** Each fitted pose view: the puppet it was fitted from, the pose, every puppet's loss (lower is nearer), the fit's time, ms, and the kept box it was fitted on. */
export const POSES = {
  'poses-1': POSES1.record,
} as const;

/**
 * The fit rows each pose view's cut-out fails that the kept poses sheet's
 * own proportions explain (`name/band/part`), why, and the proportion
 * measured on the kept poses sheet and on the kept turnaround view the
 * puppet is fitted from. Each pair is read by the fit rows' ground mask
 * over the whole figure, its height H the first to the last figure row.
 */
export const NAMED: Readonly<
  Record<
    keyof typeof POSES,
    ReadonlyArray<{
      readonly row: string;
      readonly why: string;
      readonly measure: { readonly poses: number; readonly turnaround: number };
    }>
  >
> = {
  'poses-1': [
    {
      row: 'silhouette.edge/body/figure',
      why: "the kept poses sheet draws the robe's hem wider than the turnaround the puppet is cut from; the error lies on the hem's left edge",
      // the widest figure row in the bottom 15 % of H, over H
      measure: { poses: 0.4053, turnaround: 0.3303 },
    },
    {
      row: 'silhouette.iou/figure/figure',
      why: 'the kept poses sheet draws a fuller figure than the turnaround the puppet is cut from, the robe most',
      // the figure's px over H squared
      measure: { poses: 0.3172, turnaround: 0.2671 },
    },
  ],
};

/**
 * poses-1 as his cut-out draws it: the fitted puppet's body at the fitted
 * pose, poses-1's own raised arm laid in place of his `armRight` and its
 * hand and bottle held, each where poses-1 draws it; standing on the poses
 * sheet where the kept view's crop does, held to its fit rows.
 */
export const poses1View = POSES1.view;
