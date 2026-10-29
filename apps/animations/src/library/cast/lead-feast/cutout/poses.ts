// The series lead's fitted poses (`film concept fit`, `poses/<kind>-<view>.json`):
// each kept pose view's body as the better of his front and threeQuarterLeft
// puppets fits it (its lean, neck and head, its root and its one scale, in the
// pose view's crop's frame), and the drawings the raise lays (`raise/`): the
// pose view's own raised arm in place of his `armRight` and its hand with
// the bottle held, each laid where the pose view draws it. The rows the fit
// cannot pass are named with why (`NAMED`). Pure.

import type { CutoutView, PuppetLook, PuppetPose } from '@manna/film/canvas';
import { Schema } from 'effect';
import heldPoses1 from './raise/held/poses-1.png' with { type: 'file' };
import raised from './raise/keys/raised.png' with { type: 'file' };
import RAISE_JSON from './raise/record.json' with { type: 'json' };
import POSES1_JSON from './poses/poses-poses-1.json' with { type: 'json' };
import { keptAt } from './frames.ts';
import { PUPPETS } from './puppets.ts';

type Pt = readonly [number, number];

const Point = Schema.Tuple([Schema.Finite, Schema.Finite]);

/** Where a drawing was cut from its kept view: drawing px = `s` × view px + (`dx`, `dy`). */
const Source = Schema.Struct({
  kept: Schema.String,
  s: Schema.Finite,
  dx: Schema.Finite,
  dy: Schema.Finite,
});

/** A held drawing: its id, its hand's centre (drawing px) and its source. */
const Held = Schema.Struct({ id: Schema.String, c: Point, source: Source });

/** The raise's record, as far as a pose view reads it: the pose views' own arms and the held drawings, each its id and source. */
const RaiseSources = Schema.Struct({
  views: Schema.Array(Schema.Struct({ id: Schema.String, source: Source })),
  held: Schema.Array(Held),
});

/** A fit's record (`film concept fit`). */
const PoseFit = Schema.Struct({
  view: Schema.String,
  box: Schema.Tuple([Schema.Finite, Schema.Finite, Schema.Finite, Schema.Finite]),
  from: Schema.Literals(['front', 'threeQuarterLeft']),
  pose: Schema.Struct({
    numbers: Schema.Record(Schema.String, Schema.Finite),
    root: Point,
    scale: Schema.Finite,
  }),
  scores: Schema.Struct({ front: Schema.Finite, threeQuarterLeft: Schema.Finite }),
  ms: Schema.Finite,
});

const RAISE = Schema.decodeUnknownSync(RaiseSources)(RAISE_JSON);
const FIT1 = Schema.decodeUnknownSync(PoseFit)(POSES1_JSON);

/** Each fitted pose view: the puppet it was fitted from, the pose, every puppet's loss (lower is nearer), the fit's time, ms, and the kept box it was fitted on. */
export const POSES = {
  'poses-1': { from: FIT1.from, pose: FIT1.pose, scores: FIT1.scores, ms: FIT1.ms, box: FIT1.box },
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

/** How far round the held hand the line is left as the drawings draw it, sheet px (the raise's). */
const QUIET = 42;

/**
 * Where a pose view's own pixel `v` stands in the puppet's sheet, before the
 * pose moves it: the fit lays the sheet on the view's crop by its root and
 * scale, so this is that laying undone.
 */
const sheetOf = (root: Pt, pose: PuppetPose, [x, y]: Pt): Pt => [
  root[0] + (x - pose.root[0]) / pose.scale,
  root[1] + (y - pose.root[1]) / pose.scale,
];

/** The pose view's own drawing `id`: its source on its kept view. */
const sourceOf = (id: string) => {
  const view = RAISE.views.find((v) => v.id === id);
  return Schema.decodeUnknownSync(Source)(view?.source);
};

/**
 * poses-1 as his cut-out draws it: the fitted puppet's body at the fitted
 * pose, poses-1's own raised arm laid in place of his `armRight` and its
 * hand and bottle held, each where poses-1 draws it; standing on the poses
 * sheet where the kept view's crop does (`box`), held to `fit`.
 */
export const poses1View = (fit: CutoutView['fit']): CutoutView => {
  const base = PUPPETS[FIT1.from];
  const root = base.skeleton.root ?? base.skeleton.bones[0]?.pivot ?? [0, 0];
  const pose: PuppetPose = FIT1.pose;
  const arm = sourceOf('raised');
  const held = Schema.decodeUnknownSync(Held)(RAISE.held.find((h) => h.id === 'poses-1'));
  // a drawing px p lies on the view at (p - d) / s, and on the sheet where the pose lays that
  const [s, dx, dy] = [1 / (arm.s * pose.scale), arm.dx / arm.s, arm.dy / arm.s];
  const corner = sheetOf(root, pose, [-dx, -dy]);
  const hand = sheetOf(root, pose, [
    (held.c[0] - held.source.dx) / held.source.s,
    (held.c[1] - held.source.dy) / held.source.s,
  ]);
  const look: Omit<PuppetLook, 'boil' | 'amp'> = {
    swap: {
      part: 'armRight',
      drawing: 'raised',
      place: { s, dx: corner[0], dy: corner[1] },
      pivot: [0, 0],
      theta: 0,
    },
    held: {
      drawing: 'poses-1',
      c: held.c,
      at: hand,
      quiet: QUIET,
      s: 1 / (held.source.s * pose.scale),
    },
  };
  const origin = keptAt(FIT1.from);
  return {
    box: FIT1.box,
    at: [FIT1.box[0] + origin[0], FIT1.box[1] + origin[1]],
    puppet: {
      ...base,
      key: `${base.key}/poses-1`,
      drawings: [
        { name: 'raised', png: raised },
        { name: 'poses-1', png: heldPoses1 },
      ],
    },
    pose,
    look,
    fit,
  };
};
