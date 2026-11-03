import { Array as Arr, Boolean as Bool, Match, Option, Result, Schema } from 'effect';
import { CRITIQUE_ASPECTS } from './critique.ts';
import { FIT_BARS, type FitBar, type FitRow, fitPasses } from './fit-rows.ts';
import { FigureMatched } from './match.ts';

const SheetBox = Schema.Tuple([Schema.Finite, Schema.Finite, Schema.Finite, Schema.Finite]);

const CastFinding = Schema.Struct({
  id: Schema.String,
  aspect: Schema.Literals(CRITIQUE_ASPECTS),
  what: Schema.String,
  where: Schema.OptionFromOptionalKey(Schema.String),
  stands: Schema.OptionFromOptionalKey(Schema.String),
});
type CastFinding = typeof CastFinding.Type;

const CastFitBar = Schema.Struct({
  min: Schema.optionalKey(Schema.Finite),
  max: Schema.optionalKey(Schema.Finite),
});

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
  unmatched: Schema.OptionFromOptionalKey(Schema.String),
  fit: Schema.optionalKey(Schema.Array(CastFitRow)),
  ground: Schema.optionalKey(Schema.Tuple([Schema.Int, Schema.Int, Schema.Int])),
  deltaE: Schema.optionalKey(Schema.Finite),
  critique: Schema.Literals(['taken', 'skipped']),
  skipped: Schema.OptionFromOptionalKey(Schema.String),
  findings: Schema.Array(CastFinding),
});
export type CastViewRendered = typeof CastViewRendered.Type;

export const CastRender = Schema.Struct({
  film: Schema.String,
  member: Schema.String,
  n: Schema.Int,
  at: Schema.String,
  riv: Schema.String,
  figure: Schema.optionalKey(Schema.Literals(['rig', 'cutout'])),
  boil: Schema.optionalKey(Schema.Finite),
  kinds: Schema.Record(
    Schema.String,
    Schema.Struct({
      scale: Schema.Finite,
      sheet: Schema.String,
      drawMs: Schema.optionalKey(Schema.Finite),
    }),
  ),
  views: Schema.Array(CastViewRendered),
});
export type CastRender = typeof CastRender.Type;

export const CastRenderJson = Schema.fromJsonString(CastRender);

class CastFindingUnknown extends Schema.TaggedError<CastFindingUnknown>()('CastFindingUnknown', {
  finding: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `no finding ${this.finding} to answer: ${this.reason}`;
  }
}

const findingRef = (v: CastViewRendered, f: CastFinding) => `${v.kind}-${v.view}/${f.id}`;

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

const said = (text: Option.Option<string>, some: (s: string) => string, none: string): string =>
  Option.match(text, { onNone: () => none, onSome: some });

const numberOf = (v: Option.Option<number>) =>
  Option.match(v, { onNone: () => '-', onSome: String });

const flaggedRows = (v: CastViewRendered) =>
  v.rows
    .filter((r) => r.flagged)
    .map(
      (r) =>
        `- ${r.name}: concept ${numberOf(Option.fromUndefinedOr(r.concept))}, render ${numberOf(Option.fromUndefinedOr(r.scene))}${said(Option.fromUndefinedOr(r.note), (n) => ` (${n})`, '')}`,
    );

const critiqueOf = (v: CastViewRendered) =>
  Match.value(v.critique).pipe(
    Match.when('taken', () => `[${v.files.critique}](${v.files.critique})`),
    Match.orElse(() => `skipped (${said(v.skipped, (s) => s, 'no reason given')})`),
  );

const findingLine = (f: CastFinding) =>
  `- ${f.id} **${f.aspect}**: ${f.what}${said(f.where, (w) => ` (${w})`, '')}${said(f.stands, (s) => ` — stands: ${s}`, ' — open')}`;

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

const fitName = (r: FitRow) => [r.name, r.band, r.part].filter((s) => s !== 'figure').join('/');

const fitOf = (v: CastViewRendered): ReadonlyArray<FitRow> =>
  Option.getOrElse(Option.fromUndefinedOr(v.fit), () => []);

const fitWords = (r: FitRow) => `${fitName(r)} ${r.value} (bar ${barWords(r.bar)})`;

export const fitRowLines = (v: CastViewRendered): ReadonlyArray<string> =>
  fitOf(v).map(
    (r) =>
      `  ${v.kind}-${v.view} ${Bool.match(r.pass, { onTrue: () => 'pass', onFalse: () => 'FAIL' })} ${fitWords(r)}${said(Option.fromUndefinedOr(r.where), (w) => ` ${w}`, '')}`,
  );

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
  const dE = Option.match(Option.fromUndefinedOr(v.deltaE), {
    onNone: () => '',
    onSome: (d) => ` dE=${d.toFixed(3)}`,
  });
  return [
    `${v.kind}-${v.view}: rows=${v.rows.length} flagged=${flagged}${unmatched}${dE}${fit} critique=${v.critique} findings=${v.findings.length}`,
    ...v.findings.map((f) => `  ${findingRef(v, f)} ${f.aspect}: ${f.what}`),
  ];
};

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

const drawnBy = (render: CastRender): string =>
  Match.value(render.figure).pipe(
    Match.when(
      'cutout',
      () =>
        "Each view is drawn by its puppet (`CUTOUT`), cut from the kept sheet, at the sheet's own pixels",
    ),
    Match.orElse(
      () =>
        `Each view is drawn at its sheet's one scale (${Object.entries(render.kinds)
          .map(([kind, k]) => `${kind} ${k.scale.toFixed(4)} px a unit`)
          .join(', ')})`,
    ),
  );

export const castRenderMarkdown = (render: CastRender): string =>
  [
    `# ${render.member}'s cast render ${render.n}`,
    '',
    `${render.film}, ${render.at}. Figures file sha256 \`${render.riv}\`. ${drawnBy(render)}, its kept view on the left, the render on the right, at 1:1.${Object.entries(
      render.kinds,
    )
      .flatMap(([kind, k]) =>
        Option.toArray(Option.fromUndefinedOr(k.drawMs)).map(
          (ms) => ` ${kind} drew in ${ms.toFixed(2)} ms a frame.`,
        ),
      )
      .join('')}`,
    '',
    ...fitSection(render),
    ...render.views.flatMap(viewSection),
  ].join('\n');
