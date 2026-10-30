// The kinds and views a member's cast render (`tools/cast-render.ts`)
// draws: what the film's table (`rigs/cast.ts`, `CastTable`) draws of him,
// by rig or by puppet, what the owner kept of his sheets, and the kinds an
// ask selects from them (`renderedKinds`), each refused with its reason
// (`CastRenderRefused`) when the table cannot draw it.

import { Array as Arr, Effect, Option, Schema } from 'effect';
import type { CastFigure, CastModule, CastView } from '../canvas/cast.ts';
import type { CastKept, CastSheetRecord } from '../core/cast-record.ts';
import { SheetKind } from '../core/cast-sheet.ts';

/** A cast render that cannot be made: the film's table, its record or its page do not give what it needs. */
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

/** `member`'s views of `kind` in the table: none when it draws none. */
export const tableViews = (table: CastModule, member: string, kind: SheetKind) =>
  Option.fromUndefinedOr(table.CAST?.[member]).pipe(
    Option.flatMap((kinds) => Option.fromUndefinedOr(kinds[kind])),
    Option.getOrElse((): Readonly<Record<string, CastView>> => ({})),
  );

/** The names of `member`'s views of `kind` that `figure` draws: the rigs' table's, or the cut-out table's. */
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

/** `member`'s sheet of `kind` in the table: its size and scale. */
export const tableSheet = (table: CastModule, member: string, kind: SheetKind) =>
  Option.fromUndefinedOr(table.SHEETS[member]).pipe(
    Option.flatMap((sheets) => Option.fromUndefinedOr(sheets[kind])),
  );

/** The views the owner kept of `kind`: none when he kept no such sheet. */
export const keptViews = (record: CastSheetRecord, kind: SheetKind) =>
  Option.fromUndefinedOr(record.kept).pipe(
    Option.flatMap((kept) => Option.fromUndefinedOr(kept[kind])),
    Option.map((k) => k.views),
    Option.getOrElse((): CastKept['views'] => []),
  );

/**
 * Refused unless the table draws every kept view of each kind asked (each
 * view asked, for a cut-out: a member has puppets only for the views cut),
 * draws at least one view of it, and gives each sheet its scale.
 */
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

/** The kinds a render of `member` draws for `ask`, each covered by the table (`coveredBy`), or why it cannot draw them. */
export const renderedKinds = (
  member: string,
  table: CastModule,
  record: CastSheetRecord,
  ask: { readonly kinds: ReadonlyArray<SheetKind>; readonly views: ReadonlyArray<string> },
  figure: CastFigure,
) =>
  Effect.gen(function* () {
    const viewAsked = (k: SheetKind) => ask.views.some((v) => v.startsWith(`${k}-`));
    // A kind the table draws none of is left out only when the ask did not
    // name it; a named one goes on to `coveredBy`, which refuses it.
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
