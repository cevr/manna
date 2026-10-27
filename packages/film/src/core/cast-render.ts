// A member's cast render as it is written (`film concept render`,
// `tools/cast-render.ts`): `render.json` beside its pictures in
// `out/<film>/cast/<member>/render/<n>/`, one record a render. Each kept
// view of each kind drawn holds its box, its files, the match's rows against
// its kept view (or why none could be measured), whether its critique was
// taken, and each finding with the answer it stands on once answered. A
// finding is answered on the render that found it (`answerFinding`); a fix is
// a new render. The summary (`render.md`) is written from the record, so the
// two never disagree. Pure.

import { Array as Arr, Boolean as Bool, Match, Option, Result, Schema } from 'effect';
import { CRITIQUE_ASPECTS } from './critique.ts';
import { FIT_BARS, type FitBar, type FitRow, fitPasses } from './fit-rows.ts';
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

/** A row's bar: the least and the most its value may be. */
const CastFitBar = Schema.Struct({
  min: Schema.optionalKey(Schema.Finite),
  max: Schema.optionalKey(Schema.Finite),
});

/** One fit row as the record keeps it (`FitRow`). */
const CastFitRow = Schema.Struct({
  name: Schema.String,
  band: Schema.Literals(['figure', 'head', 'body']),
  part: Schema.String,
  value: Schema.Finite,
  bar: CastFitBar,
  pass: Schema.Boolean,
  concept: Schema.optionalKey(Schema.Finite),
  render: Schema.optionalKey(Schema.Finite),
  where: Schema.optionalKey(Schema.String),
});

/** One kept view as rendered: its box, its files (relative to the render's folder), its rows, its fit rows, its critique and findings. */
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
  /** Its fit rows (`fit-rows.ts`), each with its bar: the critique waits on every one passing. A render made before them has none. */
  fit: Schema.optionalKey(Schema.Array(CastFitRow)),
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
class CastFindingUnknown extends Schema.TaggedError<CastFindingUnknown>()('CastFindingUnknown', {
  finding: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `no finding ${this.finding} to answer: ${this.reason}`;
  }
}

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

/** A bar in words: `≤ 3`, `≥ 0.9`, `0.5 to 2`. */
const barWords = (bar: FitBar) => {
  const [min, max] = [Option.fromUndefinedOr(bar.min), Option.fromUndefinedOr(bar.max)];
  return Option.match(Option.all([min, max]), {
    onSome: ([lo, hi]) => `${lo} to ${hi}`,
    onNone: () =>
      Option.match(max, {
        onSome: (hi) => `≤ ${hi}`,
        onNone: () => said(Option.map(min, String), (lo) => `≥ ${lo}`, 'any'),
      }),
  });
};

/** A fit row's name with its band and part where it has them: `silhouette.edge/head`, `class.iou/teal`. */
const fitName = (r: FitRow) => [r.name, r.band, r.part].filter((s) => s !== 'figure').join('/');

/** The fit rows a view's record holds: none for a render made before them. */
const fitOf = (v: CastViewRendered): ReadonlyArray<FitRow> =>
  Option.getOrElse(Option.fromUndefinedOr(v.fit), () => []);

/** A fit row in words: `silhouette.edge/head 4.2 (bar ≤ 3)`. */
const fitWords = (r: FitRow) => `${fitName(r)} ${r.value} (bar ${barWords(r.bar)})`;

/** Each fit row of a view, a line each, for a read of the fit rows alone: `front FAIL silhouette.edge/head 4.2 (bar ≤ 3) right row 40`. */
export const fitRowLines = (v: CastViewRendered): ReadonlyArray<string> =>
  fitOf(v).map(
    (r) =>
      `  ${v.kind}-${v.view} ${Bool.match(r.pass, { onTrue: () => 'pass', onFalse: () => 'FAIL' })} ${fitWords(r)}${said(Option.fromUndefinedOr(r.where), (w) => ` ${w}`, '')}`,
  );

/**
 * Why a view's critique waits on its fit rows: none when every row passes;
 * else each row that fails, its value and its bar, or that none could be
 * measured (no rows never pass).
 */
export const fitHeld = (rows: ReadonlyArray<FitRow>): Option.Option<string> => {
  if (fitPasses(rows)) return Option.none();
  if (rows.length === 0) return Option.some('fit: no rows (a crop reads no figure)');
  return Option.some(
    `fit: ${rows
      .filter((r) => !r.pass)
      .map(fitWords)
      .join(', ')}`,
  );
};

/**
 * A view's lines as `film concept render` prints them: its rows, the names
 * of its flagged rows, why it is unmatched when it is, its fit (`pass`, or
 * its failing rows), its critique and how many findings; then each finding,
 * its reference and its aspect.
 */
export const castViewLines = (v: CastViewRendered): ReadonlyArray<string> => {
  const flagged = Arr.match(
    v.rows.filter((r) => r.flagged).map((r) => r.name),
    { onEmpty: () => 'none', onNonEmpty: (names) => names.join(',') },
  );
  const unmatched = said(v.unmatched, (why) => ` unmatched="${why}"`, '');
  const fit = Option.match(Option.fromUndefinedOr(v.fit), {
    onNone: () => '',
    onSome: (rows) =>
      ` fit=${Option.match(fitHeld(rows), {
        onNone: () => 'pass',
        onSome: () =>
          Arr.match(rows.filter((r) => !r.pass).map(fitName), {
            onEmpty: () => 'none',
            onNonEmpty: (names) => names.join(','),
          }),
      })}`,
  });
  return [
    `${v.kind}-${v.view}: rows=${v.rows.length} flagged=${flagged}${unmatched}${fit} critique=${v.critique} findings=${v.findings.length}`,
    ...v.findings.map((f) => `  ${findingRef(v, f)} ${f.aspect}: ${f.what}`),
  ];
};

/** A fit row as the summary's table holds it, its view first. */
/** The house's bar for a row (`FIT_BARS`), its band's before its name's (every probe's is `probe`'s), where the view holds the row to a bar of its own. */
const houseBarOf = (r: FitRow): Option.Option<FitBar> => {
  const name = r.name.replace(/^probe\..*/, 'probe');
  const house = (key: string) =>
    Option.map(
      Option.fromUndefinedOr(Object.entries(FIT_BARS).find(([k]) => k === key)),
      ([, bar]): FitBar => bar,
    );
  return Option.filter(
    Option.orElse(house(`${name}/${r.band}`), () => house(name)),
    (bar) => bar.min !== r.bar.min || bar.max !== r.bar.max,
  );
};

const fitLine = (v: CastViewRendered, r: FitRow) =>
  `| ${v.kind} ${v.view} | ${fitName(r)} | ${r.value} | ${barWords(r.bar)}${said(Option.map(houseBarOf(r), barWords), (h) => ` (house ${h})`, '')} | ${Bool.match(r.pass, { onTrue: () => 'pass', onFalse: () => '**fail**' })} | ${said(Option.fromUndefinedOr(r.where), (w) => w.replaceAll('|', '\\|'), '')} |`;

/** The fit rows of every view, the failing ones first; none for a render made before them. */
const fitSection = (render: CastRender): ReadonlyArray<string> => {
  const measured = render.views.filter((v) => Option.isSome(Option.fromUndefinedOr(v.fit)));
  if (measured.length === 0) return [];
  const rows = measured.flatMap((v) => fitOf(v).map((r) => ({ v, r })));
  const unread = measured.filter((v) => fitOf(v).length === 0);
  const ordered = [...rows.filter((x) => !x.r.pass), ...rows.filter((x) => x.r.pass)];
  return [
    '## Fit rows',
    '',
    `${measured.filter((v) => fitPasses(fitOf(v))).length} of ${render.views.length} views pass every bar; a view's critique waits on its every row passing.`,
    '',
    ...Arr.match(unread, {
      onEmpty: (): ReadonlyArray<string> => [],
      onNonEmpty: (vs) => [
        ...vs.map((v) => `- ${v.kind} ${v.view}: no rows (a crop reads no figure)`),
        '',
      ],
    }),
    '| view | row | value | bar | | where |',
    '| --- | --- | --- | --- | --- | --- |',
    ...ordered.map(({ v, r }) => fitLine(v, r)),
    '',
  ];
};

/** The render's summary: its fit rows (failing first), then a section a view, its side-by-side, its flagged rows, each finding and its answer. */
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
    ...fitSection(render),
    ...render.views.flatMap(viewSection),
  ].join('\n');
