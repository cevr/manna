import type { CutoutView, PuppetLook, PuppetPose } from '@manna/film/canvas';
import { Record as Records, Schema } from 'effect';
import type { CutPuppet } from './puppets.ts';

import type { Pt } from './rules.ts';

export const own = (fit: CutoutView['fit'], puppet: CutPuppet): CutoutView => {
  const box = puppet.concept.box;
  return {
    box,
    at: [box[0], box[1]],
    puppet,
    pose: { numbers: {}, root: puppet.skeleton.root, scale: 1 },
    fit,
  };
};

const Point = Schema.Tuple([Schema.Finite, Schema.Finite]);

const Source = Schema.Struct({
  kept: Schema.String,
  s: Schema.Finite,
  dx: Schema.Finite,
  dy: Schema.Finite,
});

const Held = Schema.Struct({ id: Schema.String, c: Point, source: Source });

const RaiseSources = Schema.Struct({
  views: Schema.Array(Schema.Struct({ id: Schema.String, source: Source })),
  held: Schema.Array(Held),
});

const PoseFit = <V extends string>(views: ReadonlyArray<V>) =>
  Schema.Struct({
    view: Schema.String,
    box: Schema.Tuple([Schema.Finite, Schema.Finite, Schema.Finite, Schema.Finite]),
    from: Schema.Literals(views),
    pose: Schema.Struct({
      numbers: Schema.Record(Schema.String, Schema.Finite),
      root: Point,
      scale: Schema.Finite,
    }),
    scores: Schema.Record(Schema.Literals(views), Schema.Finite),
    ms: Schema.Finite,
  });

export interface Fitted<V extends string> {
  readonly view: string;
  readonly puppets: Readonly<Record<V, CutPuppet>>;
  readonly fit: unknown;
  readonly raise: unknown;
  readonly swap: { readonly part: string; readonly drawing: string; readonly png: string };
  readonly held: string;
  readonly quiet: number;
}

const sheetOf = (root: Pt, pose: PuppetPose, [x, y]: Pt): Pt => [
  root[0] + (x - pose.root[0]) / pose.scale,
  root[1] + (y - pose.root[1]) / pose.scale,
];

export const fitted = <V extends string>(made: Fitted<V>) => {
  const views = Records.keys(made.puppets);
  const record = Schema.decodeUnknownSync(PoseFit(views))(made.fit);
  const raise = Schema.decodeUnknownSync(RaiseSources)(made.raise);
  const view = (fit: CutoutView['fit']): CutoutView => {
    const base = made.puppets[record.from];
    const root = base.skeleton.root;
    const pose: PuppetPose = record.pose;
    const arm = Schema.decodeUnknownSync(Source)(
      raise.views.find((v) => v.id === made.swap.drawing)?.source,
    );
    const held = Schema.decodeUnknownSync(Held)(raise.held.find((h) => h.id === made.view));
    const [s, dx, dy] = [1 / (arm.s * pose.scale), arm.dx / arm.s, arm.dy / arm.s];
    const corner = sheetOf(root, pose, [-dx, -dy]);
    const hand = sheetOf(root, pose, [
      (held.c[0] - held.source.dx) / held.source.s,
      (held.c[1] - held.source.dy) / held.source.s,
    ]);
    const look: Omit<PuppetLook, 'boil' | 'amp'> = {
      swaps: [
        {
          part: made.swap.part,
          drawing: made.swap.drawing,
          place: { s, dx: corner[0], dy: corner[1] },
          pivot: [0, 0],
          rides: false,
        },
      ],
      held: {
        drawing: made.view,
        c: held.c,
        at: hand,
        quiet: made.quiet,
        s: 1 / (held.source.s * pose.scale),
      },
    };
    const origin = base.origin;
    return {
      box: record.box,
      at: [record.box[0] + origin[0], record.box[1] + origin[1]],
      puppet: {
        ...base,
        key: `${base.key}/${made.view}`,
        drawings: [
          { name: made.swap.drawing, png: made.swap.png },
          { name: made.view, png: made.held },
        ],
      },
      pose,
      look,
      fit,
    };
  };
  return {
    record: {
      from: record.from,
      pose: record.pose,
      scores: record.scores,
      ms: record.ms,
      box: record.box,
    },
    view,
  };
};
