// A cast member's cut table, built from his data: the `concept parts`
// contract @manna/film reads from `<member>/cutout/cut.ts` (`CUTS`,
// `cutOptionsFor`, `HIDDEN`, `FRAMES`, `paperOf`; `tools/part-sheet-cli.ts`). The member
// gives each view's cut in the kept view's pixels (parts front to back, laid
// by the rules in `rules.ts`), the figure it is read with, its part labels if
// he has a traced rig, and his hidden entries; the table moves each cut into
// its part sheet frame (the kept box padded) and reads each view's figure.
// A member with no traced rig gives no labels: his parts are polygons, discs
// and boxes on his figure. The table names no member. Pure.

import { cutFigureOf, enclosedPaperOf } from '@manna/film/core';
import type { cutParts, HiddenEntry, PartCut, PartCutOptions, PartRule } from '@manna/film/tools';
import type { PuppetSpec } from '@manna/film/canvas';
import { Array as Arr, Match, Option, Record as Records } from 'effect';
import { FAR, type Pt, REACH } from './rules.ts';

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

/**
 * A true gap in a view's figure: the ground its kept sheet shows through the
 * figure, closed in by its ink (between the feet, between a bench leg and a
 * skirt). `at` is a point inside it and `box` its piece's box (left, top,
 * right, bottom, the far edges exclusive), both in the kept view's pixels;
 * `why` says what the kept sheet shows there.
 */
export interface CutGap {
  readonly at: Pt;
  readonly box: Box;
  readonly why: string;
}

/**
 * One view's data: its cut in the kept view's pixels, how its figure is read,
 * the colour classes and part labels its label rules pick by, if any, and its
 * gaps. The cut holds every piece of paper the figure's ink encloses (a pale
 * swaddle, a veil and a bottle read as paper too), so each gap the kept sheet
 * shows open is named.
 */
export interface CutViewData {
  readonly cut: PartCut;
  readonly figure: FigureReading;
  readonly reads?: Pick<PartCutOptions, 'classes' | 'labels'>;
  readonly gaps?: ReadonlyArray<CutGap>;
}

/** A piece of enclosed paper a view's cut reads, in the kept view's pixels: its box (the far edges exclusive) and its pixels. */
interface PaperPiece {
  readonly box: Box;
  readonly area: number;
}

/** A view's enclosed paper: the pieces its cut holds as cloth, and the pieces it leaves open as the gaps the view names, each with its why. */
export interface CutPaper {
  readonly held: ReadonlyArray<PaperPiece>;
  readonly open: ReadonlyArray<PaperPiece & { readonly why: string }>;
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
        role: p.role,
      };
      return Option.match(Option.fromUndefinedOr(p.pivot), {
        onNone: () => part,
        onSome: (pivot) => ({ ...part, pivot: shifted(pivot, by) }),
      });
    }),
  };
};

/** A bust view with a row of the member's ink under it, so its foot is closed. */
const closedOf = (view: View, ink: Rgba): View => {
  const n = view.width * view.height;
  const rgba = new Uint8Array((n + view.width) * 4);
  rgba.set(view.rgba);
  for (let x = 0; x < view.width; x++) rgba.set(ink, (n + x) * 4);
  return { width: view.width, height: view.height + 1, rgba };
};

/** The kept box of a padded view, read alone. */
const keptOf = (frame: CutFrame, view: View): View => {
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
  return { width: w, height: h, rgba };
};

/**
 * A bust's figure: a heads view runs off its foot, where the garment meets
 * the view's edge and reads as ground to a flood from the border. Read with a
 * row of ink under the view, the foot is closed, and the figure is the cut's
 * own reading (`cutFigureOf`, its gaps open) of what the border does not
 * reach. `gaps` are points of the view.
 */
export const bustFigure = (view: View, ink: Rgba, gaps: ReadonlyArray<Pt> = []): Uint8Array =>
  cutFigureOf(closedOf(view, ink), gaps).slice(0, view.width * view.height);

/**
 * A standing view's figure in its padded frame: the kept box read as the
 * kept view alone, so its cut (and the paint okra drew for it) is the kept
 * view's, and the pad read on the padded view (the crown's and cuffs' outer
 * ink, the ground shadow's rows below the soles). The padded view's border
 * holds the shadow's lavender, which moves its reading of the paper a little
 * and so a rim pixel's. Each gap, a point of the kept view, is open on both
 * reads, moved by the pad on the padded one.
 */
export const framedFigure = (
  frame: CutFrame,
  view: View,
  gaps: ReadonlyArray<Pt> = [],
): Uint8Array => {
  const { kept, pad } = frame;
  const [w, h] = [kept[2] - kept[0], kept[3] - kept[1]];
  const inner = cutFigureOf(keptOf(frame, view), gaps);
  const onView = gaps.map((g) => shifted(g, [pad[0], pad[1]]));
  return Uint8Array.from(cutFigureOf(view, onView), (f, i) => {
    const [x, y] = [(i % view.width) - pad[0], Math.floor(i / view.width) - pad[1]];
    const inKept = x >= 0 && y >= 0 && x < w && y < h;
    return Number((inKept && inner[y * w + x] === 1) || (!inKept && f === 1));
  });
};

/**
 * A member's cut table: each view's cut in its part sheet's frame (`CUTS`),
 * what each view's cut reads beside the view (`cutOptionsFor`: its classes
 * and labels if it has them, then its figure), his hidden entries (`HIDDEN`),
 * his frames (`FRAMES`), each view's named gaps (`GAPS`) and each view's
 * enclosed paper, held or open (`paperOf`, which the dry run lists).
 */
export const cutTable = <V extends string>(member: CutMember<V>) => {
  const CUTS: Readonly<Record<V, PartCut>> = Records.map(member.views, (view, name) =>
    padded(view.cut, member.frames[name]),
  );
  const figureOf = (name: V, view: View): Uint8Array => {
    const frame = member.frames[name];
    const gaps = (member.views[name].gaps ?? []).map((g) => g.at);
    return Match.value(member.views[name].figure).pipe(
      Match.when('framed', () => framedFigure(frame, view, gaps)),
      Match.when('bust', () =>
        bustFigure(
          view,
          member.ink,
          gaps.map((g) => shifted(g, [frame.pad[0], frame.pad[1]])),
        ),
      ),
      Match.exhaustive,
    );
  };
  const cutOptionsFor = (name: V, view: View): PartCutOptions => ({
    ...member.views[name].reads,
    figure: figureOf(name, view),
  });
  const GAPS: Readonly<Record<V, ReadonlyArray<CutGap>>> = Records.map(
    member.views,
    (view) => view.gaps ?? [],
  );
  // the pieces of the reads its figure is made of, each in the kept view's pixels with the gap points in it
  const piecesOf = (name: V, view: View) => {
    const { kept, pad } = member.frames[name];
    const by: Pt = [pad[0], pad[1]];
    const gaps = GAPS[name].map((g) => g.at);
    const onView = gaps.map((g) => shifted(g, by));
    const back = (p: { box: Box; area: number; gaps: ReadonlyArray<Pt> }) => ({
      box: [p.box[0] - by[0], p.box[1] - by[1], p.box[2] - by[0], p.box[3] - by[1]] as const,
      area: p.area,
      gaps: p.gaps.map((g) => shifted(g, [-by[0], -by[1]])),
    });
    const [w, h] = [kept[2] - kept[0], kept[3] - kept[1]];
    const inPad = (p: { box: Box }) =>
      p.box[0] < by[0] || p.box[1] < by[1] || p.box[2] > by[0] + w || p.box[3] > by[1] + h;
    return Match.value(member.views[name].figure).pipe(
      Match.when('framed', () => [
        ...enclosedPaperOf(keptOf(member.frames[name], view), gaps).pieces,
        ...enclosedPaperOf(view, onView).pieces.filter(inPad).map(back),
      ]),
      Match.when('bust', () =>
        enclosedPaperOf(closedOf(view, member.ink), onView).pieces.map(back),
      ),
      Match.exhaustive,
    );
  };
  /** A view's enclosed paper as its figure reads it: each piece held, or open as the gap it names. */
  const paperOf = (name: V, view: View): CutPaper => {
    const pieces = piecesOf(name, view).map((p) => ({
      piece: { box: p.box, area: p.area },
      gap: Arr.findFirst(GAPS[name], (g) =>
        p.gaps.some((at) => at[0] === g.at[0] && at[1] === g.at[1]),
      ),
    }));
    return {
      held: pieces.flatMap((p) =>
        Option.match(p.gap, { onNone: () => [p.piece], onSome: () => [] }),
      ),
      open: pieces.flatMap((p) =>
        Option.match(p.gap, { onNone: () => [], onSome: (g) => [{ ...p.piece, why: g.why }] }),
      ),
    };
  };
  return { CUTS, cutOptionsFor, HIDDEN: member.hidden, FRAMES: member.frames, GAPS, paperOf };
};
