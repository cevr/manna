import { Array as Arr, Boolean as Bool, Option, Predicate, Result, Schema } from 'effect';
import {
  keptFile,
  SheetCheck,
  SheetKind,
  type SheetOptions,
  Slot,
  TURNAROUND_SLOTS,
  type ViewFigure,
} from './cast-sheet.ts';
import { PixelBox } from './figure.ts';
import { repoJson } from './schema.ts';
import { Segment } from './segment.ts';

const CastScope = Schema.Literals(['library', 'film']);

const CastRef = Schema.Struct({ file: Schema.String, why: Schema.String });

const CastFlag = Schema.Struct({ check: SheetCheck, views: Schema.Array(Schema.Int) });

const CastTry = Schema.Struct({
  n: Schema.Int,
  file: Schema.String,
  prompt: Schema.String,
  refs: Schema.Array(Schema.String),
  underlay: Schema.Boolean,
  retryOf: Schema.optionalKey(Schema.Int),
  flags: Schema.Array(CastFlag),
  unread: Schema.optionalKey(Schema.String),
  squash: Schema.optionalKey(Schema.Finite),
  at: Schema.String,
});
export type CastTry = typeof CastTry.Type;

const CastConcept = Schema.Struct({
  file: Schema.String,
  box: PixelBox,
  views: Schema.Array(Schema.Int),
});
type CastConcept = typeof CastConcept.Type;

const Heads = Schema.Finite.check(Schema.isBetween({ minimum: 1.5, maximum: 8 }));

const CastFigure = Schema.Struct({
  view: Schema.Int,
  height: Schema.Finite.check(Schema.isBetween({ minimum: 0.2, maximum: 1 })),
  heads: Heads,
});

const CastSheetOf = Schema.Struct({
  anchor: Schema.Int,
  layout: Schema.optionalKey(Schema.String),
  slots: Schema.optionalKey(Schema.Array(Slot)),
  standing: Schema.optionalKey(Schema.Array(Schema.Int)),
  level: Schema.optionalKey(Schema.Array(Schema.Int)),
  concepts: Schema.optionalKey(Schema.Array(CastConcept)),
  figures: Schema.optionalKey(Schema.Array(CastFigure)),
  tries: Schema.Array(CastTry),
});
type CastSheetOf = typeof CastSheetOf.Type;

const TURNAROUND_VIEWS = [
  'front',
  'threeQuarterLeft',
  'profileLeft',
  'back',
  'profileRight',
  'threeQuarterRight',
] as const;

const CastKeptView = Schema.Struct({ view: Schema.Int, name: Schema.String, box: PixelBox });

const CastKept = Schema.Struct({
  try: Schema.Int,
  why: Schema.String,
  ask: Schema.optionalKey(Schema.String),
  views: Schema.Array(CastKeptView),
});
export type CastKept = typeof CastKept.Type;

const CastReplaced = Schema.Struct({
  kind: SheetKind,
  kept: CastKept,
  by: Schema.Int,
  folder: Schema.String,
  ask: Schema.String,
  why: Schema.String,
  at: Schema.String,
});

export const CastSheetRecord = Schema.Struct({
  member: Segment,
  scope: CastScope,
  who: Schema.String,
  headgear: Schema.optionalKey(Schema.Boolean),
  hair: Schema.optionalKey(Schema.Literals(['shown', 'covered', 'none'])),
  beard: Schema.optionalKey(Schema.Literals(['shown', 'none'])),
  heads: Schema.optionalKey(Heads),
  refs: Schema.Array(CastRef),
  sheets: Schema.Struct({
    turnaround: Schema.optionalKey(CastSheetOf),
    poses: Schema.optionalKey(CastSheetOf),
    heads: Schema.optionalKey(CastSheetOf),
    single: Schema.optionalKey(CastSheetOf),
  }),
  kept: Schema.optionalKey(
    Schema.Struct({
      turnaround: Schema.optionalKey(CastKept),
      poses: Schema.optionalKey(CastKept),
      heads: Schema.optionalKey(CastKept),
      single: Schema.optionalKey(Schema.Array(CastKept)),
    }),
  ),
  replaced: Schema.optionalKey(Schema.Array(CastReplaced)),
});
export type CastSheetRecord = typeof CastSheetRecord.Type;

export const CastSheetJson = repoJson(CastSheetRecord);

class CastKindUnset extends Schema.TaggedError<CastKindUnset>()('CastKindUnset', {
  member: Schema.String,
  kind: SheetKind,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.member}'s ${this.kind} sheet is not set up: ${this.reason} (cast-sheet.json, sheets.${this.kind})`;
  }
}

export interface CastKindPlan {
  readonly layout: Option.Option<string>;
  readonly options: SheetOptions;
  readonly concepts: ReadonlyArray<CastConcept>;
}

export const castKindPlan = (
  record: CastSheetRecord,
  kind: SheetKind,
): Result.Result<CastKindPlan, CastKindUnset> =>
  Bool.match(kind === 'single', {
    onTrue: () =>
      Result.fail(
        CastKindUnset.make({
          member: record.member,
          kind,
          reason: 'a single drawing is kept by hand, not drawn as a sheet',
        }),
      ),
    onFalse: () => sheetPlan(record, kind),
  });

const sheetPlan = (
  record: CastSheetRecord,
  kind: SheetKind,
): Result.Result<CastKindPlan, CastKindUnset> => {
  const unset = (reason: string) => CastKindUnset.make({ member: record.member, kind, reason });
  const sheet: Option.Option<CastSheetOf> = Option.fromUndefinedOr(record.sheets[kind]);
  if (Option.isNone(sheet)) return Result.fail(unset('the record has no entry for it'));
  const { anchor, layout, slots, standing, level, concepts = [], figures = [] } = sheet.value;
  const turnaround = kind === 'turnaround';
  const viewSlots = Option.getOrElse(
    Option.fromUndefinedOr(slots),
    () => (turnaround && TURNAROUND_SLOTS) || [],
  );
  if (!turnaround && (Option.isNone(Option.fromUndefinedOr(layout)) || viewSlots.length === 0))
    return Result.fail(unset("poses and heads name their layout and each view's slot"));
  if (anchor < 1 || anchor > viewSlots.length)
    return Result.fail(unset(`the anchor ${anchor} is not one of its ${viewSlots.length} views`));
  const offSheet = concepts.flatMap((c) => c.views).filter((v) => v < 1 || v > viewSlots.length);
  if (offSheet.length > 0)
    return Result.fail(
      unset(`a concept names view ${offSheet.join(', ')}, not one of its ${viewSlots.length}`),
    );
  if (figures.length > 0 && kind !== 'poses')
    return Result.fail(
      unset(
        'only a pose sheet draws a smaller figure: a turnaround and a heads sheet draw one size',
      ),
    );
  const figureViews = figures.map((f) => f.view);
  const offFigures = figureViews.filter(
    (v, k) => v < 1 || v > viewSlots.length || figureViews.indexOf(v) !== k,
  );
  if (offFigures.length > 0)
    return Result.fail(
      unset(
        `a figure names view ${offFigures.join(', ')}, not one of its ${viewSlots.length} or named twice`,
      ),
    );
  return Result.succeed({
    layout: Option.fromUndefinedOr(layout),
    concepts,
    options: {
      kind,
      count: viewSlots.length,
      anchor,
      slots: viewSlots,
      ...((Predicate.isNotUndefined(standing) && { standing }) || {}),
      ...((Predicate.isNotUndefined(level) && { level }) || {}),
      headgear: record.headgear === true,
      ...((Predicate.isNotUndefined(record.heads) && { heads: record.heads }) || {}),
      ...((figures.length > 0 && { figures: figures satisfies ReadonlyArray<ViewFigure> }) || {}),
    },
  });
};

export const hairShows = (record: CastSheetRecord): boolean => (record.hair ?? 'shown') === 'shown';

export const beardShows = (record: CastSheetRecord): boolean => record.beard === 'shown';

export const nextCastTry = (record: CastSheetRecord, kind: SheetKind): number =>
  Option.match(Option.fromUndefinedOr(record.sheets[kind]), {
    onNone: () => 1,
    onSome: (sheet) => Arr.reduce(sheet.tries, 0, (n, t) => Math.max(n, t.n)) + 1,
  });

export const withCastTry = (
  record: CastSheetRecord,
  kind: SheetKind,
  tried: CastTry,
): CastSheetRecord =>
  Option.match(Option.fromUndefinedOr(record.sheets[kind]), {
    onNone: () => record,
    onSome: (sheet) => ({
      ...record,
      sheets: { ...record.sheets, [kind]: { ...sheet, tries: [...sheet.tries, tried] } },
    }),
  });

export const viewName = (kind: SheetKind, view: number): string =>
  Option.getOrElse(
    Option.filter(Arr.get(TURNAROUND_VIEWS, view - 1), () => kind === 'turnaround'),
    () => `${kind}-${view}`,
  );

export const keptOf = (record: CastSheetRecord, kind: SheetKind): ReadonlyArray<CastKept> => {
  if (kind === 'single') return record.kept?.single ?? [];
  return Option.match(Option.fromUndefinedOr(record.kept?.[kind]), {
    onNone: () => [],
    onSome: (kept) => [kept],
  });
};

export const withCastKept = (
  record: CastSheetRecord,
  kind: SheetKind,
  kept: CastKept,
): CastSheetRecord => {
  if (kind !== 'single') return { ...record, kept: { ...record.kept, [kind]: kept } };
  const names = new Set(kept.views.map((v) => v.name));
  const same = (k: CastKept): boolean => k.views.some((v) => names.has(v.name));
  const singles = keptOf(record, 'single');
  const single = Bool.match(singles.some(same), {
    onTrue: () => singles.map((k) => (same(k) && kept) || k),
    onFalse: () => [...singles, kept],
  });
  return { ...record, kept: { ...record.kept, single } };
};

export const withCastReplaced = (
  record: CastSheetRecord,
  kept: CastKept,
  replaced: typeof CastReplaced.Type,
): CastSheetRecord => ({
  ...withCastKept(record, replaced.kind, kept),
  replaced: [...(record.replaced ?? []), replaced],
});

export const replacedSince = (record: CastSheetRecord, file: string, at: string): boolean => {
  const since = (record.replaced ?? []).filter((r) => r.at > at);
  const [folder, name] = file.split('/');
  return Bool.match(folder === 'kept', {
    onTrue: () =>
      since.some((r) => r.kept.views.some((v) => keptFile(r.kind, v.name) === file)) ||
      since.some((r) => r.kind !== 'single' && `${r.kind}.png` === name),
    onFalse: () =>
      folder === 'views' && since.some((r) => r.kept.views.some((v) => `${v.name}.png` === name)),
  });
};
