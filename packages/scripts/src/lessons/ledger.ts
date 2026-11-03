import { JSONC } from 'bun';
import { Effect, FileSystem, Option, Path, Schema } from 'effect';

const FIELDS = ['Date', 'Kind', 'Said', 'Source', 'Wrong', 'Cause', 'Guard'] as const;
const KINDS = ['owner', 'review', 'retraction'];

interface Entry {
  readonly id: string;
  readonly fields: ReadonlyMap<string, string>;
  readonly twice: ReadonlyArray<string>;
}

const entriesOf = (ledger: string): ReadonlyArray<Entry> =>
  ledger
    .split('\n### ')
    .slice(1)
    .map((chunk) => {
      const [id = '', ...lines] = chunk.split('\n');
      const given = lines.flatMap((line): ReadonlyArray<readonly [string, string]> =>
        Array.from(line.matchAll(/^- \*\*(\w+):\*\* (.+)$/g), (m) => [m[1] ?? '', m[2] ?? '']),
      );
      const names = given.map(([name]) => name);
      const twice = [...new Set(names.filter((name, at) => names.indexOf(name) !== at))];
      return { id: id.trim(), fields: new Map(given), twice };
    });

type Claim =
  | { readonly _tag: 'Holds'; readonly file: string; readonly holds: string }
  | { readonly _tag: 'Lints'; readonly rule: string }
  | { readonly _tag: 'Gates'; readonly rule: string; readonly corpus: string }
  | { readonly _tag: 'Unread'; readonly why: string };

const FILE = '[^`\\s]+\\/[^`\\s]+\\.[a-z]+';

const pairsOf = (text: string): ReadonlyArray<Claim> =>
  Array.from(
    text.matchAll(new RegExp(`\`(${FILE})\` \`([^\`]+)\`((?:, (?!\`${FILE}\`)\`[^\`]+\`)*)`, 'g')),
  ).flatMap((m) =>
    [m[2] ?? '', ...Array.from((m[3] ?? '').matchAll(/`([^`]+)`/g), (n) => n[1] ?? '')].map(
      (holds): Claim => ({ _tag: 'Holds', file: m[1] ?? '', holds }),
    ),
  );

const unread = (why: string): ReadonlyArray<Claim> => [{ _tag: 'Unread', why }];

const claimsOf = (guard: string): ReadonlyArray<Claim> => {
  if (guard.startsWith('lint:')) {
    const lint = /^lint:([\w/-]+), proof (.+)$/.exec(guard);
    const proof = pairsOf(lint?.[2] ?? '');
    if (!lint || proof.length === 0)
      return unread('a lint guard names its rule and its proof: lint:<rule>, proof `file` `name`');
    return [{ _tag: 'Lints', rule: lint[1] ?? '' }, ...proof];
  }
  if (guard.startsWith('judged:')) {
    const judged = /^judged:(\w+), corpus `([^`]+)`/.exec(guard);
    if (!judged)
      return unread('a judged guard names its rule and its corpus: judged:<rule>, corpus `file`');
    return [{ _tag: 'Gates', rule: judged[1] ?? '', corpus: judged[2] ?? '' }];
  }
  const skill = /^skill: .+? Carried by `([^`]+)`: "(.+)"$/.exec(guard);
  if (skill) return [{ _tag: 'Holds', file: skill[1] ?? '', holds: skill[2] ?? '' }];
  if (guard.startsWith('code: ')) {
    const pairs = pairsOf(guard);
    if (pairs.length === 0) return unread('a code guard names no `file` `name`');
    return pairs;
  }
  if (/^none: \S/.test(guard)) return [];
  return unread('the guard is none of lint:, judged:, skill:, code: or none:');
};

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

const holdsIn = (file: string, text: string, holds: string): boolean => {
  if (!/\.tsx?$/.test(file)) return text.includes(holds);
  const code = text
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');
  if (!IDENTIFIER.test(holds)) return code.includes(holds);
  const declared = new RegExp(
    `(\\b(const|let|function|class|type|interface|enum)\\s+${holds}\\b)|(^\\s*(readonly\\s+|static\\s+|async\\s+)*${holds}\\s*[(:=?])`,
    'm',
  );
  return declared.test(code);
};

const ERROR: ReadonlySet<unknown> = new Set(['error', 'deny', 2]);

const LintConfig = Schema.Struct({
  rules: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
  overrides: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({ rules: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)) }),
    ),
  ),
});

const rulesOnIn = (config: typeof LintConfig.Type): ReadonlySet<string> =>
  new Set(
    [config.rules ?? {}, ...(config.overrides ?? []).map((o) => o.rules ?? {})].flatMap((rules) =>
      Object.entries(rules)
        .filter(([, value]) => ERROR.has([value].flat()[0]))
        .map(([rule]) => rule),
    ),
  );

const Corpus = Schema.fromJsonString(Schema.Struct({ rule: Schema.String }));

const LEDGER = 'docs/lessons.md';

const unless = (holds: boolean, problem: string): ReadonlyArray<string> =>
  [problem].filter(() => !holds);

const CITE = /\S\/([\w.-]+)\.md [A-Za-z]\d+\b/g;
const REVIEW_PART =
  /(?:^|[-.])(?:findings|review|checks?|verify|report|follow-up|followups|blocked|counsel|codex|critique|audit)(?=[-.]|$)/;
const INPUT_PART = /(?:^|[-.])(?:prompt|brief|packet)(?=[-.]|$)/;

const citesFinding = (source: string) =>
  Array.from(source.matchAll(CITE), ([, name = '']) => name).some(
    (name) => REVIEW_PART.test(name) && !INPUT_PART.test(name),
  );

const fieldProblems = (entry: Entry): ReadonlyArray<string> => {
  const field = (name: string) => entry.fields.get(name) ?? '';
  const kind = field('Kind');
  return [
    ...FIELDS.filter((name) => !entry.fields.has(name)).map((name) => `no ${name}`),
    ...entry.twice.map((name) => `${name} is given twice`),
    ...unless(/^\d{4}-\d{2}-\d{2}$/.test(field('Date')), `date ${field('Date')}`),
    ...unless(KINDS.includes(kind), `kind ${kind} is none of ${KINDS.join(', ')}`),
    ...unless(
      /^(".+"|chose: ".+".*)$/.test(field('Said')),
      'said is neither the words in quotes nor a choice',
    ),
    ...unless(
      kind !== 'review' || citesFinding(field('Source')),
      'a review entry cites no finding (<unit>/<review file> <id>, as F2 or m1)',
    ),
  ];
};

const claimProblems = (
  claim: Claim,
  on: ReadonlySet<string>,
  read: (file: string) => Effect.Effect<Option.Option<string>>,
): Effect.Effect<ReadonlyArray<string>> => {
  if (claim._tag === 'Unread') return Effect.succeed([claim.why]);
  if (claim._tag === 'Lints')
    return Effect.succeed(
      unless(on.has(claim.rule), `${claim.rule} is not on at error in .oxlintrc.json`),
    );
  if (claim._tag === 'Gates')
    return Effect.map(read(claim.corpus), (corpus) => [
      ...unless(
        on.has(`judged/${claim.rule}`),
        `judged/${claim.rule} does not gate: a rule that warns guards nothing`,
      ),
      ...unless(
        Option.exists(
          Option.flatMap(corpus, Schema.decodeOption(Corpus)),
          (c) => c.rule === claim.rule,
        ),
        `${claim.corpus} is not the corpus of ${claim.rule}`,
      ),
    ]);
  return Effect.map(read(claim.file), (text) =>
    Option.match(text, {
      onNone: () => [`no file ${claim.file}`],
      onSome: (t) =>
        unless(holdsIn(claim.file, t, claim.holds), `${claim.file} does not hold "${claim.holds}"`),
    }),
  );
};

const CONFLICT_MARKER = /^(?:<{7}|\|{7}|>{7})(?: |$)/;
const CONFLICT_MIDDLE = /^={7}$/;

const markersIn = (text: string): ReadonlyArray<string> => {
  const lines = text.split('\n').map((line) => line.replace(/\r$/, ''));
  const opened = lines.findIndex((line) => line.startsWith('<<<<<<<'));
  return lines.flatMap((line, i) =>
    unless(
      !CONFLICT_MARKER.test(line) && !(opened !== -1 && i > opened && CONFLICT_MIDDLE.test(line)),
      `${LEDGER}:${i + 1}: a conflict marker is left: ${line}`,
    ),
  );
};

export const ledgerProblems = Effect.fn('lessons.ledgerProblems')(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const read = (file: string) => fs.readFileString(path.join(root, file)).pipe(Effect.option);
  const text = yield* fs.readFileString(path.join(root, LEDGER));
  const entries = entriesOf(text);
  const config = yield* Schema.decodeUnknownEffect(LintConfig)(
    JSONC.parse(yield* fs.readFileString(path.join(root, '.oxlintrc.json'))),
  );
  const on = rulesOnIn(config);
  const problems = yield* Effect.forEach(entries, (entry) =>
    Effect.map(
      Effect.forEach(claimsOf(entry.fields.get('Guard') ?? ''), (claim) =>
        claimProblems(claim, on, read),
      ),
      (claimed) =>
        [...fieldProblems(entry), ...claimed.flat()].map((what) => `${entry.id}: ${what}`),
    ),
  );
  return { entries: entries.length, problems: [...markersIn(text), ...problems.flat()] };
});

interface Finding {
  readonly id: string;
  readonly classed: boolean;
  readonly guarded: boolean;
  readonly declined: boolean;
}

const findingsOf = (review: string): ReadonlyArray<Finding> =>
  review.split(/^(?=### F\d+\b)/m).flatMap((block) =>
    Option.toArray(
      Option.map(Option.fromNullishOr(/^### (F\d+)\b/.exec(block)), (m) => {
        const guardClass = Option.fromNullishOr(
          /^(?:- )?\*{0,2}Guard class:\*{0,2} *(lint|judged|skill|code|none)\b/m.exec(block),
        );
        return {
          id: m[1] ?? '',
          classed: Option.isSome(guardClass),
          guarded: /^(?:- )?\*{0,2}Cheapest guard:\*{0,2} *\S/m.test(block),
          declined: Option.exists(guardClass, (c) => c[1] === 'none'),
        };
      }),
    ),
  );

const citesIn = (source: string, ref: string) =>
  source.split(/[;,()]/).some((part) => part.trim() === ref || part.trim().startsWith(`${ref} `));

export const reviewRoutes = Effect.fn('lessons.reviewRoutes')(function* (
  root: string,
  reviews: ReadonlyArray<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const entries = entriesOf(yield* fs.readFileString(path.join(root, LEDGER)));
  return yield* Effect.forEach(reviews, (review) =>
    Effect.map(fs.readFileString(review), (text) => {
      const cite = `${path.basename(path.dirname(path.resolve(review)))}/${path.basename(review)}`;
      return findingsOf(text).map((finding) => {
        const ref = `${cite} ${finding.id}`;
        const by = Option.fromUndefinedOr(
          entries.find((entry) => citesIn(entry.fields.get('Source') ?? '', ref)),
        );
        return { ref, by: Option.map(by, (entry) => entry.id), ...finding };
      });
    }),
  ).pipe(Effect.map((all) => all.flat()));
});
