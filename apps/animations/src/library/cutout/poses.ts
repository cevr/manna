// A member's cut-out views (`CUTOUT`), in one of two forms.
//
// `own`: a kept view cut into its own parts, its puppet at rest as drawn,
// standing where the kept view stands. No fitting.
//
// `fitted`: a pose view drawn by his turnaround puppet fitted to it
// (`film concept fit`, `poses/<kind>-<view>.json`): the body as the better of
// his standing puppets fits it (its lean, neck and head, its root and its one
// scale, in the pose view's crop's frame), with the drawings the raise lays
// (`raise/`): the pose view's own drawn key in place of one of his parts, and
// its hand with what it holds, each laid where the pose view draws it.

import type { CutoutView, PuppetLook, PuppetPose } from '@manna/film/canvas';
import { Record as Records, Schema } from 'effect';
import type { CutPuppet } from './puppets.ts';

type Pt = readonly [number, number];

/** A view of a member's puppet at rest, its origin at the kept box's corner, held to `fit`, the view's own fit rows. */
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

/** Where a drawing was cut from its kept view: drawing px = `s` × view px + (`dx`, `dy`). */
const Source = Schema.Struct({
  kept: Schema.String,
  s: Schema.Finite,
  dx: Schema.Finite,
  dy: Schema.Finite,
});

/** A held drawing: its id, its hand's centre (drawing px) and its source. */
const Held = Schema.Struct({ id: Schema.String, c: Point, source: Source });

/** The raise's record, as far as a pose view reads it: the pose views' own drawings and the held drawings, each its id and source. */
const RaiseSources = Schema.Struct({
  views: Schema.Array(Schema.Struct({ id: Schema.String, source: Source })),
  held: Schema.Array(Held),
});

/** A fit's record (`film concept fit`), its puppets those of `views`. */
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

/** What a fitted pose view is made from. */
export interface Fitted<V extends string> {
  /** The pose view's name in his sheets' views: its held drawing's id in the raise and its drawing's name. */
  readonly view: string;
  /** The puppets the fit chose among, by view. */
  readonly puppets: Readonly<Record<V, CutPuppet>>;
  /** The fit's record (`poses/<kind>-<view>.json`), undecoded. */
  readonly fit: unknown;
  /** The raise's record (`raise/record.json`), undecoded. */
  readonly raise: unknown;
  /** The pose view's own drawn key: the part it stands in for, its id in the raise, its PNG. */
  readonly swap: { readonly part: string; readonly drawing: string; readonly png: string };
  /** The pose view's held hand's PNG. */
  readonly held: string;
  /** How far round the held hand the line is left as the drawings draw it, sheet px (the raise's). */
  readonly quiet: number;
}

/**
 * Where a pose view's own pixel `v` stands in the puppet's sheet, before the
 * pose moves it: the fit lays the sheet on the view's crop by its root and
 * scale, so this is that laying undone.
 */
const sheetOf = (root: Pt, pose: PuppetPose, [x, y]: Pt): Pt => [
  root[0] + (x - pose.root[0]) / pose.scale,
  root[1] + (y - pose.root[1]) / pose.scale,
];

/**
 * A fitted pose view: its fit's record (the puppet it was fitted from, the
 * pose, every puppet's loss, lower nearer, the fit's time, ms, and the kept
 * box it was fitted on), and the view as his cut-out draws it, held to a
 * fit: the fitted puppet's body at the fitted pose, the pose view's drawn key
 * laid in place of its part and its hand held, each where the pose view
 * draws it; standing on the poses sheet where the kept view's crop does.
 */
export const fitted = <V extends string>(made: Fitted<V>) => {
  const views = Records.keys(made.puppets).filter((v): v is V => Object.hasOwn(made.puppets, v));
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
    // a drawing px p lies on the view at (p - d) / s, and on the sheet where the pose lays that
    const [s, dx, dy] = [1 / (arm.s * pose.scale), arm.dx / arm.s, arm.dy / arm.s];
    const corner = sheetOf(root, pose, [-dx, -dy]);
    const hand = sheetOf(root, pose, [
      (held.c[0] - held.source.dx) / held.source.s,
      (held.c[1] - held.source.dy) / held.source.s,
    ]);
    const look: Omit<PuppetLook, 'boil' | 'amp'> = {
      swap: {
        part: made.swap.part,
        drawing: made.swap.drawing,
        place: { s, dx: corner[0], dy: corner[1] },
        pivot: [0, 0],
        theta: 0,
      },
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
