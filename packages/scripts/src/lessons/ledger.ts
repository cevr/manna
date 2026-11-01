// The lessons ledger (`docs/lessons.md`): one entry per mistake the repo was
// shown, the owner's correction, a reviewer's folded finding or an agent's
// retracted claim, each held to the guard that now catches it. A guard is
// one of five classes, each held to what its file holds:
//
// - `lint:<rule>`, its proof `` `file` `name` ``: the rule is on at error in
//   `.oxlintrc.json` (its rules or an override's), and the proof file (a
//   test, or a fixture marking `RED <rule>`) holds the name;
// - `judged:<rule>`, its corpus `` `file` ``: the judged rule gates
//   (`judged/<rule>` at error, which its measured precision on the corpus
//   decides: a rule that warns guards nothing, and its lesson is a skill
//   line), and the corpus is that rule's;
// - `skill: <why>. Carried by `file`: "<line>"`: the file holds the line
//   word for word;
// - `code:` `` `file` `name` `` pairs: each file declares the name (or holds
//   it in a line that is no comment);
// - `none: <why>`: no guard, and why (a finding declined).
//
// A reviewer's finding is routed by its entry: `merge-audit --review`
// refuses a unit whose review names a finding (`### F<n> …`) that no entry's
// Source cites (`<unit>/<review file> F<n>`), or one that leaves out its
// guard class or its cheapest guard. A finding its review classes `none`
// needs no entry: it is declined, and the review passes.

import { JSONC } from 'bun';
import { Effect, FileSystem, Option, Path, Schema } from 'effect';

const FIELDS = ['Date', 'Kind', 'Said', 'Source', 'Wrong', 'Cause', 'Guard'] as const;
const KINDS = ['owner', 'review', 'retraction'];

/** One entry: its id, each field's words as written, and each field it gives more than once. */
interface Entry {
  readonly id: string;
  readonly fields: ReadonlyMap<string, string>;
  readonly twice: ReadonlyArray<string>;
}

/** The entries of the ledger's text, in order; a field given twice keeps its last words. */
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

/** What a guard asks of the repo. */
type Claim =
  | { readonly _tag: 'Holds'; readonly file: string; readonly holds: string }
  | { readonly _tag: 'Lints'; readonly rule: string }
  | { readonly _tag: 'Gates'; readonly rule: string; readonly corpus: string }
  | { readonly _tag: 'Unread'; readonly why: string };

/** A guard's file, `dir/file.ext`, as the words in its backticks. */
const FILE = '[^`\\s]+\\/[^`\\s]+\\.[a-z]+';

/**
 * A guard's `` `file` `name` `` pairs, a file's further names listed after
 * it as `` , `name` `` each, up to the next file.
 */
const pairsOf = (text: string): ReadonlyArray<Claim> =>
  Array.from(
    text.matchAll(new RegExp(`\`(${FILE})\` \`([^\`]+)\`((?:, (?!\`${FILE}\`)\`[^\`]+\`)*)`, 'g')),
  ).flatMap((m) =>
    [m[2] ?? '', ...Array.from((m[3] ?? '').matchAll(/`([^`]+)`/g), (n) => n[1] ?? '')].map(
      (holds): Claim => ({ _tag: 'Holds', file: m[1] ?? '', holds }),
    ),
  );

const unread = (why: string): ReadonlyArray<Claim> => [{ _tag: 'Unread', why }];

/** What a guard field asks of the repo, by its class. */
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

/** A name a declaration can carry. */
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/**
 * Whether `text`, the file `file`, holds `holds`: in code, a name by its
 * declaration (`const`, `function`, `class`, `type`, `interface`, `enum`, a
 * method or a field) and any other words by a line that is no comment, so a
 * word left in a comment holds no guard; in any other file, the words.
 */
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

/** How oxlint spells a rule set to error. */
const ERROR: ReadonlySet<unknown> = new Set(['error', 'deny', 2]);

const LintConfig = Schema.Struct({
  rules: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
  overrides: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({ rules: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)) }),
    ),
  ),
});

/** The rules `.oxlintrc.json` sets to error anywhere: its own rules or an override's. */
const rulesOnIn = (config: typeof LintConfig.Type): ReadonlySet<string> =>
  new Set(
    [config.rules ?? {}, ...(config.overrides ?? []).map((o) => o.rules ?? {})].flatMap((rules) =>
      Object.entries(rules)
        .filter(([, value]) => ERROR.has([value].flat()[0]))
        .map(([rule]) => rule),
    ),
  );

const Corpus = Schema.fromJsonString(Schema.Struct({ rule: Schema.String }));

/** The ledger's path from the repo's root. */
const LEDGER = 'docs/lessons.md';

/** `problem`, unless `holds`. */
const unless = (holds: boolean, problem: string): ReadonlyArray<string> =>
  [problem].filter(() => !holds);

/** Each `<unit>/<file>.md <id>` of a Source, captured by the file's name. */
const CITE = /\S\/([\w.-]+)\.md [A-Za-z]\d+\b/g;
/** A review's word as one of a file name's parts, joined by `-` or `.`. */
const REVIEW_PART =
  /(?:^|[-.])(?:findings|review|checks?|verify|report|follow-up|followups|blocked|counsel|codex|critique|audit)(?=[-.]|$)/;
/** A reviewer's input as one of a file name's parts, joined by `-` or `.`. */
const INPUT_PART = /(?:^|[-.])(?:prompt|brief|packet)(?=[-.]|$)/;

/**
 * Whether a Source cites a finding in its review file: `<unit>/<file> <id>`,
 * the file's name holding a review's word as one of its parts
 * (`round-1-findings.md`, `review-r1.md`, `p1-round-1-checks.md`,
 * `p5-self-check.md`, `round-2-verify.md`, `report.md`, `follow-up-1.md`,
 * `followups.md`, `blocked.md`, `round-3-counsel.md`, `codex.md`,
 * `critique-r2.md`, `<view>.critique.md`, `semantic-audit.md`) and no
 * reviewer's input (`round-1-review-brief.md`, `review-1-prompt.md`,
 * `counsel-packet.md`), so a spec's phase (`unit/spec.md p5`) or a brief's
 * numbered ask cites no finding.
 */
const citesFinding = (source: string) =>
  Array.from(source.matchAll(CITE), ([, name = '']) => name).some(
    (name) => REVIEW_PART.test(name) && !INPUT_PART.test(name),
  );

/** What is wrong with an entry's fields: one missing, a date, a kind or words of the wrong shape, a review that cites no finding. */
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

/** What is wrong with one claim of a guard, given the rules on and a reader of the repo's files. */
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

/** A line a merge or rebase leaves to open, part or close two sides of a conflict. */
const CONFLICT_MARKER = /^(?:<{7}|\|{7}|>{7})(?: |$)/;
/** The line between a conflict's two sides; alone, a Markdown heading's underline. */
const CONFLICT_MIDDLE = /^={7}$/;

/**
 * Each conflict marker left in the ledger's text, by its line, so a bad rebase
 * cannot land one; a line of seven `=` counts only after a conflict opens.
 */
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

/** The ledger at `root`: how many entries it holds, and each problem with one (its fields, or a guard the repo does not hold). */
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

/**
 * One finding of a review: its number, whether it names its guard class and
 * its cheapest guard, and whether that class is `none` (no guard, so no
 * entry needed).
 */
interface Finding {
  readonly id: string;
  readonly classed: boolean;
  readonly guarded: boolean;
  readonly declined: boolean;
}

/** The findings of a review's text: each `### F<n> …` heading and the block under it. */
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

/** Whether a Source cites `ref` (`p6-x/review-1.md F2`) whole: not `F2` inside `F21`. */
const citesIn = (source: string, ref: string) =>
  source.split(/[;,()]/).some((part) => part.trim() === ref || part.trim().startsWith(`${ref} `));

/**
 * Each finding of the review files (paths from `cwd`), routed or not: a
 * finding is cited by `<unit>/<file> F<n>`, its unit the folder the review
 * sits in, and it is routed when an entry of the ledger at `root` cites it in
 * its Source. A finding that names no guard class or no cheapest guard
 * breaks the reviewer's contract.
 */
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
