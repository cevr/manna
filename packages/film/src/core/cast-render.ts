// A member's cast render as it is written (`film concept render`,
// `tools/cast-render.ts`): `render.json` beside its pictures in
// `out/<film>/cast/<member>/render/<n>/`, one record a render. Each kept
// view of each kind drawn holds its box, its files, the match's rows against
// its kept view (or why none could be measured), whether its critique was
// taken, and each finding with the answer it stands on once answered. A
// finding is answered on the render that found it (`answerFinding`); a fix is
// a new render. The summary (`render.md`) is written from the record, so the
// two never disagree. Pure.

import { Array as Arr, Match, Option, Result, Schema } from 'effect';
import { CRITIQUE_ASPECTS } from './critique.ts';
import { FigureMatched } from './match.ts';

/** A box in a sheet's pixels: left, top, right, bottom. */
const SheetBox = Schema.Tuple([Schema.Finite, Schema.Finite, Schema.Finite, Schema.Finite]);

/** One finding of a view's critique, by its id in the view, and the answer it stands on once answered. */
const CastFinding = Schema.Struct({
  id: Schema.String,
  aspect: Schema.Literals(CRITIQUE_ASPECTS),
  what: Schema.String,
  where: Schema.OptionFromOptionalKey(Schema.String),
  stands: Schema.OptionFromOptionalKey(Schema.String),
});
type CastFinding = typeof CastFinding.Type;

/** One kept view as rendered: its box, its files (relative to the render's folder), its rows, its critique and findings. */
const CastViewRendered = Schema.Struct({
  kind: Schema.String,
  view: Schema.String,
  box: SheetBox,
  files: Schema.Struct({
    concept: Schema.String,
    render: Schema.String,
    side: Schema.String,
    table: Schema.String,
    critique: Schema.String,
  }),
  rows: FigureMatched.fields.rows,
  /** Why no row could be measured: the measure read no figure in a crop. */
  unmatched: Schema.OptionFromOptionalKey(Schema.String),
  critique: Schema.Literals(['taken', 'skipped']),
  /** Why the critique was skipped: never a pass. */
  skipped: Schema.OptionFromOptionalKey(Schema.String),
  findings: Schema.Array(CastFinding),
});
export type CastViewRendered = typeof CastViewRendered.Type;

/** A member's cast render: what was drawn (the figures file's digest), each sheet's one scale and picture, each view. */
export const CastRender = Schema.Struct({
  film: Schema.String,
  member: Schema.String,
  n: Schema.Int,
  at: Schema.String,
  /** The sha256 of the figures file the render drew. */
  riv: Schema.String,
  kinds: Schema.Record(
    Schema.String,
    Schema.Struct({ scale: Schema.Finite, sheet: Schema.String }),
  ),
  views: Schema.Array(CastViewRendered),
});
export type CastRender = typeof CastRender.Type;

export const CastRenderJson = Schema.fromJsonString(CastRender);

/** A finding an answer names that the render does not hold. */
export class CastFindingUnknown extends Schema.TaggedError<CastFindingUnknown>()(
  'CastFindingUnknown',
  { finding: Schema.String, reason: Schema.String },
) {
  override get message() {
    return `no finding ${this.finding} to answer: ${this.reason}`;
  }
}

/** The number the next render takes: one past the highest of `taken`, 1 for the first. */
export const nextRender = (taken: ReadonlyArray<number>): number => Math.max(0, ...taken) + 1;

/** A finding's name in a render: `<kind>-<view>/<id>`. */
const findingRef = (v: CastViewRendered, f: CastFinding) => `${v.kind}-${v.view}/${f.id}`;

/**
 * `render` with finding `ref` (`<kind>-<view>/<id>`) answered: it stands, for
 * `why`. Refused for a finding the render does not hold, and for an empty why.
 */
export const answerFinding = (
  render: CastRender,
  ref: string,
  why: string,
): Result.Result<CastRender, CastFindingUnknown> => {
  if (why.trim().length === 0)
    return Result.fail(
      CastFindingUnknown.make({ finding: ref, reason: 'an answer says why it stands' }),
    );
  const held = render.views.some((v) => v.findings.some((f) => findingRef(v, f) === ref));
  if (!held)
    return Result.fail(
      CastFindingUnknown.make({
        finding: ref,
        reason: `render ${render.n} holds ${render.views.flatMap((v) => v.findings.map((f) => findingRef(v, f))).join(', ') || 'no finding'}`,
      }),
    );
  return Result.succeed({
    ...render,
    views: render.views.map((v) => ({
      ...v,
      findings: v.findings.map((f) => {
        if (findingRef(v, f) !== ref) return f;
        return { ...f, stands: Option.some(why.trim()) };
      }),
    })),
  });
};

/** `text` said by `some`, or `none` when there is none. */
const said = (text: Option.Option<string>, some: (s: string) => string, none: string): string =>
  Option.match(text, { onNone: () => none, onSome: some });

/** A row's number, or a dash where its crop does not show it. */
const numberOf = (v: Option.Option<number>) =>
  Option.match(v, { onNone: () => '-', onSome: String });

/** The rows past their tolerance, as the summary lists them. */
const flaggedRows = (v: CastViewRendered) =>
  v.rows
    .filter((r) => r.flagged)
    .map(
      (r) =>
        `- ${r.name}: concept ${numberOf(Option.fromUndefinedOr(r.concept))}, render ${numberOf(Option.fromUndefinedOr(r.scene))}${said(Option.fromUndefinedOr(r.note), (n) => ` (${n})`, '')}`,
    );

/** Where a view's critique is: its file, or why it was skipped. */
const critiqueOf = (v: CastViewRendered) =>
  Match.value(v.critique).pipe(
    Match.when('taken', () => `[${v.files.critique}](${v.files.critique})`),
    Match.orElse(() => `skipped (${said(v.skipped, (s) => s, 'no reason given')})`),
  );

/** A finding's line: its id, aspect and words, where it is, and its answer or that it is open. */
const findingLine = (f: CastFinding) =>
  `- ${f.id} **${f.aspect}**: ${f.what}${said(f.where, (w) => ` (${w})`, '')}${said(f.stands, (s) => ` — stands: ${s}`, ' — open')}`;

/** One view's section of the summary. */
const viewSection = (v: CastViewRendered): ReadonlyArray<string> => [
  `## ${v.kind} ${v.view}`,
  '',
  `![${v.kind} ${v.view}](${v.files.side})`,
  '',
  `Box ${v.box.join(',')}. Table: [${v.files.table}](${v.files.table}). Critique: ${critiqueOf(v)}.`,
  '',
  ...Option.match(v.unmatched, {
    onNone: (): ReadonlyArray<string> => [],
    onSome: (u) => [`Unmatched: ${u}`, ''],
  }),
  ...Arr.match(flaggedRows(v), {
    onEmpty: () => Arr.filter(['No row flagged.', ''], () => Option.isNone(v.unmatched)),
    onNonEmpty: (rows) => ['Flagged rows:', '', ...rows, ''],
  }),
  ...Arr.match(v.findings, {
    onEmpty: () => Arr.filter(['No finding.', ''], () => v.critique === 'taken'),
    onNonEmpty: (fs) => ['Findings:', '', ...fs.map(findingLine), ''],
  }),
];

/** The render's summary: a section a view, its side-by-side, its flagged rows, each finding and its answer. */
export const castRenderMarkdown = (render: CastRender): string =>
  [
    `# ${render.member}'s cast render ${render.n}`,
    '',
    `${render.film}, ${render.at}. Figures file sha256 \`${render.riv}\`. Each view is drawn at its sheet's one scale (${Object.entries(
      render.kinds,
    )
      .map(([kind, k]) => `${kind} ${k.scale.toFixed(4)} px a unit`)
      .join(', ')}), its kept view on the left, the render on the right, at 1:1.`,
    '',
    ...render.views.flatMap(viewSection),
  ].join('\n');
