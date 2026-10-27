// A film's cast render table (`rigs/cast.ts`, `CAST`): each kept view of
// each member's sheets, by member, kind and view name, drawn by its rig in
// its pose, laid in the view's kept box on a canvas the size of the sheet
// (`film concept render`, `tools/cast-render.ts`), so the render reads as the
// sheet and each view is held to the one the owner kept. The rig's origin
// stands at `at` in the sheet's pixels, drawn at the sheet's one scale
// (`CastSheet.scale`): a standing figure's feet on the sheet's ground line, a
// bust's head where the sheet draws it, never a figure fitted to its box.
// What else the view draws lies in the rig's own units about that origin:
// the rigs drawn with it (its hands at its cuffs, a baby's head) and its
// props (a bottle, a stool), each a plain canvas piece. Pure: the table is
// data a test reads in Bun, and only its props' draws touch a canvas.

import type { FitBar, FitBarName, FitClass, FitProbe } from '../core/fit-rows.ts';
import type { PoseOf, RivePropSpec } from './rive.ts';

type Pt = readonly [number, number];

/** A box in a sheet's pixels: left, top, right, bottom. */
type SheetBox = readonly [number, number, number, number];

/** A rig drawn with a view's own: its pose, its origin at `at` in the view's units. */
interface CastWith {
  readonly rig: RivePropSpec;
  readonly pose: PoseOf<RivePropSpec>;
  readonly at: Pt;
}

/**
 * Where a prop lies among a view's drawings (`castDrawOrder`): behind its
 * figure (a stool, a table), held (over the figure, under the rigs drawn
 * with it: a bottle in front of the sleeve, its hand over it), or in front
 * of them all.
 */
type CastLayer = 'behind' | 'held' | 'front';

/** A plain canvas piece a view draws (a bottle, a stool): in the view's units about its origin, in its layer (`front` unless given). */
export interface CastProp {
  readonly name: string;
  readonly draw: (ctx: CanvasRenderingContext2D) => void;
  readonly layer?: CastLayer;
}

/** One drawing of a view, in the order the page draws them: a prop, its figure, or a rig drawn with it. */
type CastDrawing =
  | { readonly kind: 'prop'; readonly prop: CastProp }
  | { readonly kind: 'figure' }
  | { readonly kind: 'with'; readonly with: CastWith };

/** A bar a view holds a fit row to in place of the house's (`FIT_BARS`), and why. */
interface CastFitBar extends FitBar {
  readonly why: string;
}

/**
 * What a view's fit rows hold beyond the house's (`core/fit-rows.ts`): its
 * probes (a scanline across a feature a review measured: an ear's band, a
 * chin's line), and a bar of its own for a row, each with its reason.
 */
interface CastFit {
  readonly probes?: ReadonlyArray<FitProbe>;
  readonly bars?: Readonly<Partial<Record<FitBarName, CastFitBar>>>;
}

/** One kept view: its kept box, where its rig's origin stands in the sheet's pixels, the rig in its pose, what is drawn with it, and what its fit rows hold beyond the house's. */
export interface CastView {
  readonly box: SheetBox;
  readonly at: Pt;
  readonly rig: RivePropSpec;
  readonly pose: PoseOf<RivePropSpec>;
  readonly with?: ReadonlyArray<CastWith>;
  readonly props?: ReadonlyArray<CastProp>;
  readonly fit?: CastFit;
}

/** A film's cast render table: member, kind (`turnaround`, `poses`, `heads`), kept view name. */
type CastTable = Readonly<
  Record<string, Readonly<Record<string, Readonly<Record<string, CastView>>>>>
>;

/** A kept sheet as the render lays it: its size in pixels, and its one scale, sheet pixels a canon unit. */
export interface CastSheet {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
}

/** Each member's sheets, by kind: what the render's canvas and scale are. */
type CastSheets = Readonly<Record<string, Readonly<Record<string, CastSheet>>>>;

/** What a film's `rigs/cast.ts` gives the cast render: its table, its sheets, the paper its page lays them on, and each member's colour classes for his fit rows (none, no class rows). */
export interface CastModule {
  readonly CAST: CastTable;
  readonly SHEETS: CastSheets;
  readonly PAPER: { readonly base: string; readonly tone: string; readonly seed: number };
  readonly FIT_CLASSES?: Readonly<Record<string, Readonly<Record<string, FitClass>>>>;
}

/** The page name of `member`'s cast render in `film`: what the player mounts and `film concept render` opens. */
export const castPage = (film: string, member: string) => `${film}/cast/${member}`;

/** A film's cast render table, checked by its type: every view of every kind of every member. */
export const castTable = <const T extends CastTable>(table: T): T => table;

/**
 * A view's drawings back to front: the props behind its figure, the figure,
 * the props it holds, the rigs drawn with it (its hands, over what they
 * hold), the props in front.
 */
export const castDrawOrder = (view: CastView): ReadonlyArray<CastDrawing> => {
  const props = (layer: CastLayer): CastDrawing[] =>
    (view.props ?? [])
      .filter((p) => (p.layer ?? 'front') === layer)
      .map((prop) => ({ kind: 'prop', prop }));
  return [
    ...props('behind'),
    { kind: 'figure' },
    ...props('held'),
    ...(view.with ?? []).map((w): CastDrawing => ({ kind: 'with', with: w })),
    ...props('front'),
  ];
};

/** `a` less `b`, as the boxes it leaves (none, or up to four): the bands above and below `b`, then those beside it between them. */
const boxLess = (a: SheetBox, b: SheetBox): SheetBox[] => {
  const [ax0, ay0, ax1, ay1] = a;
  const [bx0, by0, bx1, by1] = b;
  if (bx0 >= ax1 || bx1 <= ax0 || by0 >= ay1 || by1 <= ay0) return [a];
  const [my0, my1] = [Math.max(ay0, by0), Math.min(ay1, by1)];
  const bands: SheetBox[] = [
    [ax0, ay0, ax1, my0],
    [ax0, my1, ax1, ay1],
    [ax0, my0, Math.max(ax0, bx0), my1],
    [Math.min(ax1, bx1), my0, ax1, my1],
  ];
  return bands.filter(([x0, y0, x1, y1]) => x1 > x0 && y1 > y0);
};

/** Where a view of a sheet is drawn: within `box`, less each of `cuts`. */
interface CastClip {
  readonly box: SheetBox;
  readonly cuts: ReadonlyArray<SheetBox>;
}

/**
 * Where `view` is drawn on its sheet beside `views` (the sheet's every
 * view, itself too): its kept box and `margin` round it, where a line it
 * lays just past its box (a crown's ink) shows, less every other view's box
 * there but what lies in its own. A view's crop by its box then holds its
 * own drawing alone, never a neighbour's ink that ran over into it.
 */
const castClip = (view: CastView, views: ReadonlyArray<CastView>, margin: number): CastClip => {
  const [x0, y0, x1, y1] = view.box;
  const box: SheetBox = [x0 - margin, y0 - margin, x1 + margin, y1 + margin];
  const [bx0, by0, bx1, by1] = box;
  const cuts = views
    .filter((other) => other !== view)
    .flatMap((other) => boxLess(other.box, view.box))
    .map(([cx0, cy0, cx1, cy1]): SheetBox => [
      Math.max(cx0, bx0),
      Math.max(cy0, by0),
      Math.min(cx1, bx1),
      Math.min(cy1, by1),
    ])
    .filter(([cx0, cy0, cx1, cy1]) => cx1 > cx0 && cy1 > cy0);
  return { box, cuts };
};

/** The part of a 2D context a view's clip is laid on. */
type CastClipContext = Pick<CanvasRenderingContext2D, 'beginPath' | 'rect' | 'clip'>;

/**
 * Clips `ctx` to where `view` is drawn beside `views` (`castClip`): its box
 * and `margin` round it, then each cut taken out of it (the box again with
 * the cut inside it, its inside even-odd out). The caller saves and restores.
 */
export const clipCast = (
  ctx: CastClipContext,
  view: CastView,
  views: ReadonlyArray<CastView>,
  margin: number,
) => {
  const clip = castClip(view, views, margin);
  const [x0, y0, x1, y1] = clip.box;
  ctx.beginPath();
  ctx.rect(x0, y0, x1 - x0, y1 - y0);
  ctx.clip();
  for (const [cx0, cy0, cx1, cy1] of clip.cuts) {
    ctx.beginPath();
    ctx.rect(x0, y0, x1 - x0, y1 - y0);
    ctx.rect(cx0, cy0, cx1 - cx0, cy1 - cy0);
    ctx.clip('evenodd');
  }
};

/** Every rig a member's views draw, by key: what its page declares and loads. */
export const castRigs = (member: Readonly<Record<string, Readonly<Record<string, CastView>>>>) => {
  const rigs: Record<string, RivePropSpec> = {};
  for (const views of Object.values(member))
    for (const v of Object.values(views))
      for (const rig of [v.rig, ...(v.with ?? []).map((w) => w.rig)]) rigs[rig.key] = rig;
  return rigs;
};
