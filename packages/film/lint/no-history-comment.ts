import { Effect } from 'effect';
import { Diagnostic, Rule, RuleContext, Visitor } from 'oxlint-plugin-effect/rule-bindings';

interface Tell {
  readonly what: string;
  readonly pattern: RegExp;
}

const LEDGER_ID =
  /\b(?:GR|G|UR[23]?|DL3?|RS3?|SU3?|ST3?|US[23]?|SV[23]?|PSH?3?|ET3?|HC|H|PA|AA|UI3?|LS|PL|EA|NS|MC|OG3?|T|R[123](?:-[a-z]+)*)-\d+[a-z]?\b|(?<![\w-])[A-Z]{2,}[A-Z0-9]*\d-\d+[a-z]?\b|\bG\d{1,2}\b/gu;

const TELLS: ReadonlyArray<Tell> = [
  { what: 'a pass number', pattern: /\bpass(?:es)?[ -]\d+\b/giu },
  { what: 'a batch id', pattern: /\bp\d+-[a-z][a-z0-9]*\b/gu },
  { what: 'a ledger id', pattern: LEDGER_ID },
  {
    what: 'a commit hash',
    pattern:
      /(?<![#\w-])(?![a-f]+\d+(?![\w-]))(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}(?![\w-])/gu,
  },
];

const VALUES =
  /`[^`\n]*`|"[^"\n]*"|(?<!\w)'[^'\n]*'(?!\w)|\b[a-z][a-z0-9+.-]*:\/\/\S+|\bwww\.\S+/giu;

const prose = (text: string): string => text.replace(VALUES, (value) => ' '.repeat(value.length));

const tellsIn = (
  text: string,
): ReadonlyArray<{ readonly at: number; readonly length: number; readonly what: string }> => {
  const words = prose(text);
  return TELLS.flatMap(({ what, pattern }) =>
    Array.from(words.matchAll(pattern), (m) => ({ at: m.index, length: m[0].length, what })),
  );
};

const OPENER = 2;

export const noHistoryComment = Rule.define({
  name: 'no-history-comment',
  meta: Rule.meta({
    type: 'suggestion',
    description:
      'A comment says what the code does now and why; how it got here (a pass, a batch, a ledger id, a commit) lives in the ledger and git log.',
  }),
  create: function* () {
    const context = yield* RuleContext;
    return Visitor.on('Program', () =>
      Effect.forEach(
        context.sourceCode.getAllComments().filter((c) => c.type !== 'Shebang'),
        (comment) =>
          Effect.forEach(
            tellsIn(comment.value),
            ({ at, length, what }) => {
              const start = comment.range[0] + OPENER + at;
              return context.report(
                Diagnostic.make({
                  node: { range: [start, start + length] },
                  message: `${what} in a comment tells history: say what the code does today and why; how it got here lives in the ledger and git log.`,
                }),
              );
            },
            { discard: true },
          ),
        { discard: true },
      ),
    );
  },
});
