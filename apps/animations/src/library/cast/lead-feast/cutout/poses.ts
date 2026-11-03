import { fitted } from '../../../cutout/poses.ts';
import heldPoses1 from './raise/held/poses-1.png' with { type: 'file' };
import raised from './raise/keys/raised.png' with { type: 'file' };
import RAISE_JSON from './raise/record.json' with { type: 'json' };
import POSES1_JSON from './poses/poses-poses-1.json' with { type: 'json' };
import { PUPPETS } from './puppets.ts';

const POSES1 = fitted({
  view: 'poses-1',
  puppets: { front: PUPPETS.front, threeQuarterLeft: PUPPETS.threeQuarterLeft },
  fit: POSES1_JSON,
  raise: RAISE_JSON,
  swap: { part: 'armRight', drawing: 'raised', png: raised },
  held: heldPoses1,
  quiet: 42,
});

export const POSES = {
  'poses-1': POSES1.record,
} as const;

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
      measure: { poses: 0.4053, turnaround: 0.3303 },
    },
    {
      row: 'silhouette.iou/figure/figure',
      why: 'the kept poses sheet draws a fuller figure than the turnaround the puppet is cut from, the robe most',
      measure: { poses: 0.3172, turnaround: 0.2671 },
    },
  ],
};

export const poses1View = POSES1.view;
