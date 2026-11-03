import { cutFigureOf, enclosedPaperOf } from '@manna/film/core';
import type { cutParts, HiddenEntry, PartCut, PartCutOptions, PartRule } from '@manna/film/tools';
import type { PuppetSpec } from '@manna/film/canvas';
import { Array as Arr, Match, Option, Record as Records } from 'effect';
import { FAR, type Pt, REACH } from './rules.ts';

type Box = readonly [number, number, number, number];

export type KeptSheet = Extract<
  NonNullable<PuppetSpec['concept']>['image'],
  { readonly cast: string }
>['sheet'];

export interface CutFrame {
  readonly sheet: KeptSheet;
  readonly kept: Box;
  readonly pad: Box;
}

type View = Parameters<typeof cutParts>[0];

type Rgba = readonly [number, number, number, number];

type FigureReading = 'framed' | 'bust';

export interface CutGap {
  readonly at: Pt;
  readonly box: Box;
  readonly why: string;
}

export interface CutViewData {
  readonly cut: PartCut;
  readonly figure: FigureReading;
  readonly reads?: Pick<PartCutOptions, 'classes' | 'labels'>;
  readonly gaps?: ReadonlyArray<CutGap>;
}

interface PaperPiece {
  readonly box: Box;
  readonly area: number;
}

export interface CutPaper {
  readonly held: ReadonlyArray<PaperPiece>;
  readonly open: ReadonlyArray<PaperPiece & { readonly why: string }>;
  readonly stale: ReadonlyArray<CutGap & { readonly opened: ReadonlyArray<Box> }>;
}

export interface CutMember<V extends string> {
  readonly frames: Readonly<Record<V, CutFrame>>;
  readonly views: Readonly<Record<V, CutViewData>>;
  readonly hidden: Readonly<Record<V, HiddenEntry>>;
  readonly ink: Rgba;
}

const shifted = (p: Pt, by: Pt): Pt => [p[0] + by[0], p[1] + by[1]];

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

const closedOf = (view: View, ink: Rgba): View => {
  const n = view.width * view.height;
  const rgba = new Uint8Array((n + view.width) * 4);
  rgba.set(view.rgba);
  for (let x = 0; x < view.width; x++) rgba.set(ink, (n + x) * 4);
  return { width: view.width, height: view.height + 1, rgba };
};

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

export const bustFigure = (view: View, ink: Rgba, gaps: ReadonlyArray<Pt> = []): Uint8Array =>
  cutFigureOf(closedOf(view, ink), gaps).slice(0, view.width * view.height);

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
  const piecesOf = (name: V, view: View) => {
    const { kept, pad } = member.frames[name];
    const by: Pt = [pad[0], pad[1]];
    const gaps = GAPS[name].map((g) => g.at);
    const onView = gaps.map((g) => shifted(g, by));
    const [w, h] = [kept[2] - kept[0], kept[3] - kept[1]];
    const inKept = (x: number, y: number) =>
      x >= by[0] && y >= by[1] && x < by[0] + w && y < by[1] + h;
    const listed =
      (width: number, holds: (x: number, y: number) => boolean, shift: Pt) =>
      (p: { box: Box; area: number; gaps: ReadonlyArray<Pt>; pixels: ReadonlyArray<number> }) => {
        const own = p.pixels
          .map((i): Pt => [i % width, Math.floor(i / width)])
          .filter(([x, y]) => holds(x, y));
        const back = (b: Box): Box => [
          b[0] - shift[0],
          b[1] - shift[1],
          b[2] - shift[0],
          b[3] - shift[1],
        ];
        return {
          box: back(p.box),
          area: p.area,
          gaps: p.gaps.map((g) => shifted(g, [-shift[0], -shift[1]])),
          held: Arr.head(own).pipe(
            Option.map((first) => ({
              box: back(
                own.reduce<Box>(
                  (b, [x, y]) => [
                    Math.min(b[0], x),
                    Math.min(b[1], y),
                    Math.max(b[2], x + 1),
                    Math.max(b[3], y + 1),
                  ],
                  [first[0], first[1], first[0] + 1, first[1] + 1],
                ),
              ),
              area: own.length,
            })),
          ),
        };
      };
    return Match.value(member.views[name].figure).pipe(
      Match.when('framed', () => [
        ...enclosedPaperOf(keptOf(member.frames[name], view), gaps).pieces.map(
          listed(w, () => true, [0, 0]),
        ),
        ...enclosedPaperOf(view, onView)
          .pieces.map(listed(view.width, (x, y) => !inKept(x, y), by))
          .filter((p) => Option.isSome(p.held)),
      ]),
      Match.when('bust', () =>
        enclosedPaperOf(closedOf(view, member.ink), onView).pieces.map(
          listed(view.width, (_, y) => y < view.height, by),
        ),
      ),
      Match.exhaustive,
    );
  };
  const paperOf = (name: V, view: View): CutPaper => {
    const read = piecesOf(name, view);
    const pieces = read.map((p) => ({
      piece: { box: p.box, area: p.area },
      held: p.held,
      gap: Arr.findFirst(GAPS[name], (g) =>
        p.gaps.some((at) => at[0] === g.at[0] && at[1] === g.at[1]),
      ),
    }));
    const same = (a: Box, b: Box) => a.every((v, i) => v === b[i]);
    return {
      held: pieces.flatMap((p) =>
        Option.match(p.gap, { onNone: () => Option.toArray(p.held), onSome: () => [] }),
      ),
      open: pieces.flatMap((p) =>
        Option.match(p.gap, { onNone: () => [], onSome: (g) => [{ ...p.piece, why: g.why }] }),
      ),
      stale: GAPS[name]
        .map((g) => ({
          ...g,
          opened: read
            .filter((p) => p.gaps.some((at) => at[0] === g.at[0] && at[1] === g.at[1]))
            .map((p) => p.box),
        }))
        .filter((g) => !g.opened.some((b) => same(b, g.box))),
    };
  };
  return { CUTS, cutOptionsFor, HIDDEN: member.hidden, FRAMES: member.frames, GAPS, paperOf };
};
