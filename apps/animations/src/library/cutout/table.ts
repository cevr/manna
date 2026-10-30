// A cast member's cut table, built from his data: the `concept parts`
// contract @manna/film reads from `<member>/cutout/cut.ts` (`CUTS`,
// `cutOptionsFor`, `HIDDEN`, `FRAMES`; `tools/part-sheet-cli.ts`). The member
// gives each view's cut in the kept view's pixels (parts front to back, laid
// by the rules in `rules.ts`), the figure it is read with, its part labels if
// he has a traced rig, and his hidden entries; the table moves each cut into
// its part sheet frame (the kept box padded) and reads each view's figure.
// A member with no traced rig gives no labels: his parts are polygons, discs
// and boxes on his figure. The table names no member. Pure.

import {
  cutFigureOf,
  cutParts,
  type HiddenEntry,
  type PartCut,
  type PartCutOptions,
  type PartRule,
} from '@manna/film/tools';
import type { PuppetSpec } from '@manna/film/canvas';
import { Match, Option, Record as Records, Result } from 'effect';
import { FAR, type Pt, REACH, box } from './rules.ts';

/** A box on a kept sheet: left, top, right, bottom. */
type Box = readonly [number, number, number, number];

/** A member's kept sheet a cut view is on, as a puppet's concept names it (`cast/<member>/kept/<sheet>.png`). */
export type KeptSheet = Extract<
  NonNullable<PuppetSpec['concept']>['image'],
  { readonly cast: string }
>['sheet'];

/** A view's frame on its kept sheet: the sheet it is on, its kept box, and the pixels its part sheet pads it by (left, top, right, bottom). */
export interface CutFrame {
  readonly sheet: KeptSheet;
  readonly kept: Box;
  readonly pad: Box;
}

/** A view the cut reads: its part sheet frame's pixels. */
type View = Parameters<typeof cutParts>[0];

/** An RGBA colour, 0-255 each. */
type Rgba = readonly [number, number, number, number];

/**
 * How a view's figure is read. `framed`: a standing view, its kept box read
 * as the kept view alone and its pad read on the padded view. `bust`: a heads
 * view that runs off its foot, read with a row of the member's ink under it.
 */
type FigureReading = 'framed' | 'bust';

/** One view's data: its cut in the kept view's pixels, how its figure is read, and the colour classes and part labels its label rules pick by, if any. */
export interface CutViewData {
  readonly cut: PartCut;
  readonly figure: FigureReading;
  readonly reads?: Pick<PartCutOptions, 'classes' | 'labels'>;
}

/** A member's cut data, by his views' names in his sheets' views. */
export interface CutMember<V extends string> {
  readonly frames: Readonly<Record<V, CutFrame>>;
  readonly views: Readonly<Record<V, CutViewData>>;
  readonly hidden: Readonly<Record<V, HiddenEntry>>;
  /** His sheets' ink, for the row that closes a bust's foot. */
  readonly ink: Rgba;
}

/** A disc's centre or a part's pivot read in the kept view's pixels, in its part sheet's: moved by the pad alone, so a centre left of or above the kept box keeps its place. */
const shifted = (p: Pt, by: Pt): Pt => [p[0] + by[0], p[1] + by[1]];

/** A polygon's coordinate on an axis whose padded view is `size` pixels long: a near marker (at or below -1) `REACH` before the view, a far marker (`k * FAR`) `k * REACH` past the pad's start and past a view wider than `REACH` by the excess, any other moved by the pad. */
const onAxis = (v: number, by: number, size: number): number =>
  Match.value(v).pipe(
    Match.when(
      (u) => u <= -1,
      () => -REACH,
    ),
    Match.when(
      (u) => u >= FAR,
      (u) => Math.max((u / FAR) * REACH + by, size + 1),
    ),
    Match.orElse((u) => u + by),
  );

/** A rule in a frame `size` pixels: its polygon's edge markers resolved and its other points moved by `by`; a disc's centre and a pivot are points of the view, never markers. */
const onFrame = (r: PartRule, by: Pt, size: Pt): PartRule =>
  Match.value(r).pipe(
    Match.when({ polygon: Match.defined }, (q) => ({
      polygon: q.polygon.map((p): Pt => [
        onAxis(p[0], by[0], size[0]),
        onAxis(p[1], by[1], size[1]),
      ]),
    })),
    Match.when({ disc: Match.defined }, (q) => ({
      disc: { c: shifted(q.disc.c, by), r: q.disc.r },
    })),
    Match.orElse((q) => q),
  );

/** A cut read in the kept view's pixels, moved into its part sheet's frame, its edge markers on the frame's edges. */
export const padded = (cut: PartCut, frame: CutFrame): PartCut => {
  const { kept, pad } = frame;
  const by: Pt = [pad[0], pad[1]];
  const size: Pt = [kept[2] - kept[0] + pad[0] + pad[2], kept[3] - kept[1] + pad[1] + pad[3]];
  return {
    parts: cut.parts.map((p) => {
      const part = {
        name: p.name,
        take: p.take.map((r) => onFrame(r, by, size)),
        unless: Option.getOrElse(Option.fromUndefinedOr(p.unless), () => []).map((r) =>
          onFrame(r, by, size),
        ),
      };
      return Option.match(Option.fromUndefinedOr(p.pivot), {
        onNone: () => part,
        onSome: (pivot) => ({ ...part, pivot: shifted(pivot, by) }),
      });
    }),
  };
};

/**
 * A bust's figure: a heads view runs off its foot, where the garment meets
 * the view's edge and reads as ground to a flood from the border. Read with a
 * row of ink under the view, the foot is closed, and the figure is the cut's
 * own reading (enclosed paper less) of what the border does not reach.
 */
export const bustFigure = (view: View, ink: Rgba): Uint8Array => {
  const n = view.width * view.height;
  const rgba = new Uint8Array((n + view.width) * 4);
  rgba.set(view.rgba);
  for (let x = 0; x < view.width; x++) rgba.set(ink, (n + x) * 4);
  const closed = { width: view.width, height: view.height + 1, rgba };
  const all: PartCut = {
    parts: [{ name: 'figure', take: [box(-1, -1, closed.width + 1, closed.height + 1)] }],
  };
  return Result.match(cutParts(closed, all), {
    onSuccess: (sheet) => sheet.owner.slice(0, n),
    onFailure: () => new Uint8Array(n),
  });
};

/**
 * A standing view's figure in its padded frame: the kept box read as the
 * kept view alone, so its cut (and the paint okra drew for it) is the kept
 * view's, and the pad read on the padded view (the crown's and cuffs' outer
 * ink, the ground shadow's rows below the soles). The padded view's border
 * holds the shadow's lavender, which moves its reading of the paper a little
 * and so a rim pixel's.
 */
export const framedFigure = (frame: CutFrame, view: View): Uint8Array => {
  const { kept, pad } = frame;
  const [w, h] = [kept[2] - kept[0], kept[3] - kept[1]];
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    rgba.set(
      view.rgba.subarray(
        ((y + pad[1]) * view.width + pad[0]) * 4,
        ((y + pad[1]) * view.width + pad[0] + w) * 4,
      ),
      y * w * 4,
    );
  const inner = cutFigureOf({ width: w, height: h, rgba });
  return Uint8Array.from(cutFigureOf(view), (f, i) => {
    const [x, y] = [(i % view.width) - pad[0], Math.floor(i / view.width) - pad[1]];
    const inKept = x >= 0 && y >= 0 && x < w && y < h;
    return Number((inKept && inner[y * w + x] === 1) || (!inKept && f === 1));
  });
};

/**
 * A member's cut table: each view's cut in its part sheet's frame (`CUTS`),
 * what each view's cut reads beside the view (`cutOptionsFor`: its classes
 * and labels if it has them, then its figure), his hidden entries (`HIDDEN`)
 * and his frames (`FRAMES`).
 */
export const cutTable = <V extends string>(member: CutMember<V>) => {
  const CUTS: Readonly<Record<V, PartCut>> = Records.map(member.views, (view, name) =>
    padded(view.cut, member.frames[name]),
  );
  const figureOf = (name: V, view: View): Uint8Array =>
    Match.value(member.views[name].figure).pipe(
      Match.when('framed', () => framedFigure(member.frames[name], view)),
      Match.when('bust', () => bustFigure(view, member.ink)),
      Match.exhaustive,
    );
  const cutOptionsFor = (name: V, view: View): PartCutOptions => ({
    ...member.views[name].reads,
    figure: figureOf(name, view),
  });
  return { CUTS, cutOptionsFor, HIDDEN: member.hidden, FRAMES: member.frames };
};
