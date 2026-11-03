import { Predicate } from 'effect';
import { BOIL_AMP } from '../core/boil.ts';
import type { FitBar, FitBarName, FitClass, FitProbe } from '../core/fit-rows.ts';
import type { LabelTable } from '../core/label.ts';
import type { PuppetLook, PuppetPose, PuppetSpec } from './puppet.ts';
import type { PoseOf, RivePropSpec } from './rive.ts';

type Pt = readonly [number, number];

type SheetBox = readonly [number, number, number, number];

interface CastWith {
  readonly rig: RivePropSpec;
  readonly pose: PoseOf<RivePropSpec>;
  readonly at: Pt;
}

type CastLayer = 'behind' | 'held' | 'front';

export interface CastProp {
  readonly name: string;
  readonly draw: (ctx: CanvasRenderingContext2D) => void;
  readonly layer?: CastLayer;
}

type CastDrawing =
  | { readonly kind: 'prop'; readonly prop: CastProp }
  | { readonly kind: 'figure' }
  | { readonly kind: 'with'; readonly with: CastWith };

interface CastFitBar extends FitBar {
  readonly why: string;
}

interface CastFit {
  readonly labels?: LabelTable;
  readonly probes?: ReadonlyArray<FitProbe>;
  readonly bars?: Readonly<Partial<Record<FitBarName, CastFitBar>>>;
}

export interface CastView {
  readonly box: SheetBox;
  readonly at: Pt;
  readonly rig: RivePropSpec;
  readonly pose: PoseOf<RivePropSpec>;
  readonly with?: ReadonlyArray<CastWith>;
  readonly props?: ReadonlyArray<CastProp>;
  readonly fit?: CastFit;
}

interface Boxed {
  readonly box: SheetBox;
}

export interface CutoutView {
  readonly box: SheetBox;
  readonly at: Pt;
  readonly puppet: PuppetSpec;
  readonly pose: PuppetPose;
  readonly look?: Omit<PuppetLook, 'boil' | 'amp'>;
  readonly fit?: CastFit;
}

type CutoutTable = Readonly<
  Record<string, Readonly<Record<string, Readonly<Record<string, CutoutView>>>>>
>;

export const cutoutTable = <const T extends CutoutTable>(table: T): T => table;

export const cutoutPuppets = (
  member: Readonly<Record<string, Readonly<Record<string, CutoutView>>>>,
) => {
  const puppets: Record<string, PuppetSpec> = {};
  for (const views of Object.values(member))
    for (const v of Object.values(views)) puppets[v.puppet.key] = v.puppet;
  return puppets;
};

export type CastFigure = 'rig' | 'cutout';

type CastTable = Readonly<
  Record<string, Readonly<Record<string, Readonly<Record<string, CastView>>>>>
>;

export interface CastSheet {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
}

type CastSheets = Readonly<Record<string, Readonly<Record<string, CastSheet>>>>;

export interface CastModule {
  readonly CAST?: CastTable;
  readonly CUTOUT?: CutoutTable;
  readonly SHEETS: CastSheets;
  readonly PAPER: { readonly base: string; readonly tone: string; readonly seed: number };
  readonly FIT_CLASSES?: Readonly<Record<string, Readonly<Record<string, FitClass>>>>;
  readonly EASES?: Readonly<Record<string, Readonly<Record<string, CutoutEase>>>>;
}

export const isCastModule = (u: unknown): u is CastModule =>
  Predicate.hasProperty(u, 'SHEETS') &&
  Predicate.hasProperty(u, 'PAPER') &&
  Predicate.isObject(u.SHEETS) &&
  Predicate.isObject(u.PAPER) &&
  ((Predicate.hasProperty(u, 'CAST') && Predicate.isObject(u.CAST)) ||
    (Predicate.hasProperty(u, 'CUTOUT') && Predicate.isObject(u.CUTOUT)));

export const defaultFigure = (m: CastModule, member: string): CastFigure =>
  m.CAST?.[member] === undefined && m.CUTOUT?.[member] !== undefined ? 'cutout' : 'rig';

export const CUTOUT_MARGIN: Pt = [160, 40];

export interface CutoutEaseFrame {
  readonly pose: PuppetPose;
  readonly look: PuppetLook;
  readonly key: string;
  readonly theta: number;
  readonly held: string;
}

export interface CutoutEase {
  readonly kind: string;
  readonly view: string;
  readonly from: string;
  readonly to: string;
  readonly fps: number;
  readonly count: number;
  readonly puppet: PuppetSpec;
  readonly frame: (i: number) => CutoutEaseFrame;
}

export const easePage = (film: string, member: string) => `${film}/cast/${member}/ease`;

export const easeScene = (from: string, to: string) => `${from}-${to}`;

export const CUTOUT_BOILS: ReadonlyArray<number> = [BOIL_AMP, 0];

export const castPage = (
  film: string,
  member: string,
  figure: CastFigure = 'rig',
  boil: number = BOIL_AMP,
  kind?: string,
) =>
  figure === 'rig'
    ? `${film}/cast/${member}`
    : `${film}/cast/${member}/cutout${boil === BOIL_AMP ? '' : `/boil-${boil}`}${kind === undefined ? '' : `/${kind}`}`;

export const castTable = <const T extends CastTable>(table: T): T => table;

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

interface CastClip {
  readonly box: SheetBox;
  readonly cuts: ReadonlyArray<SheetBox>;
}

const castClip = (view: Boxed, views: ReadonlyArray<Boxed>, margin: number): CastClip => {
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

type CastClipContext = Pick<CanvasRenderingContext2D, 'beginPath' | 'rect' | 'clip'>;

export const clipCast = (
  ctx: CastClipContext,
  view: Boxed,
  views: ReadonlyArray<Boxed>,
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

export const castRigs = (member: Readonly<Record<string, Readonly<Record<string, CastView>>>>) => {
  const rigs: Record<string, RivePropSpec> = {};
  for (const views of Object.values(member))
    for (const v of Object.values(views))
      for (const rig of [v.rig, ...(v.with ?? []).map((w) => w.rig)]) rigs[rig.key] = rig;
  return rigs;
};
