import { Array as Arr, Effect, Option, Schema } from 'effect';
import type { CastFigure, CastModule, CastView } from '../canvas/cast.ts';
import { type CastSheetRecord, keptOf } from '../core/cast-record.ts';
import { SheetKind } from '../core/cast-sheet.ts';

export class CastRenderRefused extends Schema.TaggedError<CastRenderRefused>()(
  'CastRenderRefused',
  {
    member: Schema.String,
    reason: Schema.String,
  },
) {
  override get message() {
    return `${this.member}'s cast render: ${this.reason}`;
  }
}

export const tableViews = (table: CastModule, member: string, kind: SheetKind) =>
  Option.fromUndefinedOr(table.CAST?.[member]).pipe(
    Option.flatMap((kinds) => Option.fromUndefinedOr(kinds[kind])),
    Option.getOrElse((): Readonly<Record<string, CastView>> => ({})),
  );

export const drawnViews = (
  table: CastModule,
  member: string,
  kind: SheetKind,
  figure: CastFigure,
) =>
  ({
    rig: () => Object.keys(tableViews(table, member, kind)),
    cutout: () =>
      Object.keys(
        Option.getOrElse(Option.fromUndefinedOr(table.CUTOUT?.[member]?.[kind]), () => ({})),
      ),
  })[figure]();

export const tableSheet = (table: CastModule, member: string, kind: SheetKind) =>
  Option.fromUndefinedOr(table.SHEETS[member]).pipe(
    Option.flatMap((sheets) => Option.fromUndefinedOr(sheets[kind])),
  );

export const keptViews = (record: CastSheetRecord, kind: SheetKind) =>
  keptOf(record, kind).flatMap((k) => k.views);

const coveredBy = (
  member: string,
  table: CastModule,
  record: CastSheetRecord,
  kinds: ReadonlyArray<SheetKind>,
  asked: ReadonlyArray<string>,
  figure: CastFigure,
) =>
  Effect.forEach(kinds, (kind) => {
    const views = drawnViews(table, member, kind, figure);
    const missing = keptViews(record, kind).filter(
      (v) => !views.includes(v.name) && (figure === 'rig' || asked.includes(`${kind}-${v.name}`)),
    );
    if (missing.length > 0)
      return CastRenderRefused.make({
        member,
        reason: {
          rig: `rigs/cast.ts draws no ${missing.map((v) => `${kind} ${v.name}`).join(', ')}: every kept view needs a rig and a pose`,
          cutout: `rigs/cast.ts has no puppet for ${missing.map((v) => `${kind}-${v.name}`).join(', ')} (CUTOUT)`,
        }[figure],
      });
    if (views.length === 0)
      return CastRenderRefused.make({ member, reason: `rigs/cast.ts draws no ${kind} view` });
    if (Option.isNone(tableSheet(table, member, kind)))
      return CastRenderRefused.make({
        member,
        reason: `rigs/cast.ts gives the ${kind} sheet no scale`,
      });
    return Effect.void;
  });

export const renderedKinds = (
  member: string,
  table: CastModule,
  record: CastSheetRecord,
  ask: { readonly kinds: ReadonlyArray<SheetKind>; readonly views: ReadonlyArray<string> },
  figure: CastFigure,
) =>
  Effect.gen(function* () {
    const viewAsked = (k: SheetKind) => ask.views.some((v) => v.startsWith(`${k}-`));
    const kinds = Arr.filter(
      SheetKind.literals,
      (k) =>
        keptViews(record, k).length > 0 &&
        (ask.kinds.length === 0 || ask.kinds.includes(k)) &&
        (ask.views.length === 0 || viewAsked(k)) &&
        (drawnViews(table, member, k, figure).length > 0 || ask.kinds.includes(k) || viewAsked(k)),
    );
    if (kinds.length === 0)
      return yield* CastRenderRefused.make({ member, reason: 'no kind asked is kept' });
    yield* coveredBy(member, table, record, kinds, ask.views, figure);
    return kinds;
  });
