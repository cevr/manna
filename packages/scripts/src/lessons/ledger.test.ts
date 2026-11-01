import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path, Stream } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';
import { ledgerProblems, reviewRoutes } from './ledger.ts';

/** An entry of a ledger, its Guard and its Kind as given, its other fields well formed. */
const entry = (id: string, guard: string, kind = 'owner', source = 'memory x.md') =>
  [
    `### ${id}`,
    '',
    '- **Date:** 2026-10-19',
    `- **Kind:** ${kind}`,
    '- **Said:** "do it so"',
    `- **Source:** ${source}`,
    '- **Wrong:** it was not so.',
    '- **Cause:** Not recorded.',
    `- **Guard:** ${guard}`,
    '',
  ].join('\n');

/** The lint config of the scratch repos: one rule on, one judged rule gating, one warning. */
const CONFIG = `{
  // comments, as JSONC
  "rules": { "no-console": "error", "judged/gates": ["error", {}], "judged/warns": ["warn", {}] },
  "overrides": [{ "files": ["**/lint/**"], "rules": { "film/own-rule": ["error", {}], "eqeqeq": "warn" } }]
}`;

/** The files the scratch repos hold beside their ledger. */
const FILES = {
  '.oxlintrc.json': CONFIG,
  'src/thing.ts': "export const held = 1;\n// unheld\ntest('refuses a thing', () => {});\n",
  'lint/fixtures/own.ts': 'call(); // RED film/own-rule\n',
  'skills/SKILL.md': 'Say what the code does.\n',
  'judged/gates.json': '{ "rule": "gates", "cases": [] }',
  'judged/warns.json': '{ "rule": "warns", "cases": [] }',
};

/** A scratch repo with `ledger` as its docs/lessons.md beside `FILES`, and its root. */
const repoWith = (ledger: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: 'lessons-' });
    yield* Effect.forEach(Object.entries({ ...FILES, 'docs/lessons.md': ledger }), ([file, text]) =>
      Effect.gen(function* () {
        yield* fs.makeDirectory(path.dirname(path.join(root, file)), { recursive: true });
        yield* fs.writeFileString(path.join(root, file), text);
      }),
    );
    return root;
  });

/** The problems the ledger check finds in a scratch repo whose ledger holds `entries`. */
const problemsOf = (...entries: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const root = yield* repoWith(`# Lessons\n\n## A section\n\n${entries.join('\n')}`);
    return (yield* ledgerProblems(root)).problems;
  }).pipe(Effect.scoped, Effect.provide(BunServices.layer));

describe('the lessons ledger', () => {
  it.effect('holds each guard class that its file holds', () =>
    Effect.gen(function* () {
      expect(
        yield* problemsOf(
          entry('a-lint', 'lint:no-console, proof `src/thing.ts` `refuses a thing`'),
          entry(
            'a-plugin-lint',
            'lint:film/own-rule, proof `lint/fixtures/own.ts` `RED film/own-rule`',
          ),
          entry('a-judged', 'judged:gates, corpus `judged/gates.json` (precision 1.00)'),
          entry(
            'a-skill',
            'skill: words are content. Carried by `skills/SKILL.md`: "Say what the code does."',
          ),
          entry('a-code', 'code: `src/thing.ts` `held` (the check)'),
          entry(
            'a-none',
            'none: the finding was wrong about the order',
            'review',
            'p6-x/review-1.md F2',
          ),
        ),
      ).toEqual([]);
    }),
  );

  it.effect('refuses a conflict marker a merge left in it, by its line', () =>
    Effect.gen(function* () {
      expect(
        yield* problemsOf(
          entry('a-code', 'code: `src/thing.ts` `held` (the check)'),
          '<<<<<<< HEAD',
          '||||||| parent of fbddd2651 (feat(film): a beat names its cast)',
          '=======',
          '>>>>>>> fbddd2651',
          entry('b-code', 'code: `src/thing.ts` `held` (the check)'),
          'A line with ======= inside it, and a heading rule:',
          '========',
        ),
      ).toEqual([
        'docs/lessons.md:15: a conflict marker is left: <<<<<<< HEAD',
        'docs/lessons.md:16: a conflict marker is left: ||||||| parent of fbddd2651 (feat(film): a beat names its cast)',
        'docs/lessons.md:17: a conflict marker is left: =======',
        'docs/lessons.md:18: a conflict marker is left: >>>>>>> fbddd2651',
      ]);
    }),
  );

  it.effect(
    'reads a heading underlined in seven = as a heading, and a marker ending in CRLF as a marker',
    () =>
      Effect.gen(function* () {
        expect(
          yield* problemsOf(
            entry('a-code', 'code: `src/thing.ts` `held` (the check)'),
            'A heading',
            '=======',
          ),
        ).toEqual([]);
        expect(
          yield* problemsOf(
            entry('a-code', 'code: `src/thing.ts` `held` (the check)'),
            '<<<<<<< HEAD\r',
            '=======\r',
            '>>>>>>> fbddd2651\r',
          ),
        ).toEqual([
          'docs/lessons.md:15: a conflict marker is left: <<<<<<< HEAD',
          'docs/lessons.md:16: a conflict marker is left: =======',
          'docs/lessons.md:17: a conflict marker is left: >>>>>>> fbddd2651',
        ]);
      }),
  );

  it.effect('refuses each guard its file does not hold', () =>
    Effect.gen(function* () {
      expect(
        yield* problemsOf(
          entry('lint-off', 'lint:eqeqeq, proof `src/thing.ts` `refuses a thing`'),
          entry('lint-unproved', 'lint:no-console'),
          entry('lint-proof-lost', 'lint:no-console, proof `src/thing.ts` `refuses another`'),
          entry('judged-warns', 'judged:warns, corpus `judged/warns.json`'),
          entry('judged-other-corpus', 'judged:gates, corpus `judged/warns.json`'),
          entry(
            'skill-reworded',
            'skill: words are content. Carried by `skills/SKILL.md`: "Say what it does."',
          ),
          entry('code-in-comment', 'code: `src/thing.ts` `unheld`'),
          entry('code-no-file', 'code: `src/gone.ts` `held`'),
          entry('unclassed', '`src/thing.ts` `held`'),
          entry('none-empty', 'none: '),
        ),
      ).toEqual([
        'lint-off: eqeqeq is not on at error in .oxlintrc.json',
        'lint-unproved: a lint guard names its rule and its proof: lint:<rule>, proof `file` `name`',
        'lint-proof-lost: src/thing.ts does not hold "refuses another"',
        'judged-warns: judged/warns does not gate: a rule that warns guards nothing',
        'judged-other-corpus: judged/warns.json is not the corpus of gates',
        'skill-reworded: skills/SKILL.md does not hold "Say what it does."',
        'code-in-comment: src/thing.ts does not hold "unheld"',
        'code-no-file: no file src/gone.ts',
        'unclassed: the guard is none of lint:, judged:, skill:, code: or none:',
        'none-empty: the guard is none of lint:, judged:, skill:, code: or none:',
      ]);
    }),
  );

  it.effect("refuses an entry's fields of the wrong shape", () =>
    Effect.gen(function* () {
      const fine = entry('fine', 'none: a reason');
      expect(
        yield* problemsOf(
          fine.replace('2026-10-19', '19 Oct').replace('### fine', '### bad-date'),
          fine.replace('Kind:** owner', 'Kind:** agent').replace('### fine', '### bad-kind'),
          fine.replace('"do it so"', 'do it so').replace('### fine', '### unquoted'),
          entry('review-uncited', 'none: a reason', 'review', 'a review'),
          fine.replace('- **Cause:** Not recorded.\n', '').replace('### fine', '### no-cause'),
        ),
      ).toEqual([
        'bad-date: date 19 Oct',
        'bad-kind: kind agent is none of owner, review, retraction',
        'unquoted: said is neither the words in quotes nor a choice',
        'review-uncited: a review entry cites no finding (<unit>/<review file> <id>, as F2 or m1)',
        'no-cause: no Cause',
      ]);
    }),
  );

  it.effect('reads a finding cited by the id its review gives it, as F2, M1, m3, o2 or T3', () =>
    Effect.gen(function* () {
      expect(
        yield* problemsOf(
          entry('by-f', 'none: a reason', 'review', 'p6-x/review-1.md F2'),
          entry('by-major', 'none: a reason', 'review', 'run/unit/p5-round-1-findings.md M1, m1'),
          entry('by-optional', 'none: a reason', 'review', 'unit/round-1-findings.md o2, T3'),
          entry('by-file-alone', 'none: a reason', 'review', 'unit/round-1-findings.md'),
          entry('by-word', 'none: a reason', 'review', 'unit/spec.md Goal'),
        ),
      ).toEqual([
        'by-file-alone: a review entry cites no finding (<unit>/<review file> <id>, as F2 or m1)',
        'by-word: a review entry cites no finding (<unit>/<review file> <id>, as F2 or m1)',
      ]);
    }),
  );

  it.effect(
    'reads a finding only in a review-shaped file: findings, review, checks, verify, report, follow-up or blocked',
    () =>
      Effect.gen(function* () {
        expect(
          yield* problemsOf(
            entry('in-findings', 'none: a reason', 'review', 'unit/rw-round-2-findings.md F1'),
            entry('in-review', 'none: a reason', 'review', 'unit/review-art-3.md F2'),
            entry('in-checks', 'none: a reason', 'review', 'run/unit/p1-round-1-checks.md F7'),
            entry('in-self-check', 'none: a reason', 'review', 'unit/p5-self-check.md F3'),
            entry('in-verify', 'none: a reason', 'review', 'unit/round-2-verify.md F1'),
            entry('in-report', 'none: a reason', 'review', 'unit/report.md F3'),
            entry('in-follow-up', 'none: a reason', 'review', 'unit/follow-up-1.md F2'),
            entry('in-blocked', 'none: a reason', 'review', 'unit/blocked.md F2 (option B)'),
            entry('in-spec', 'none: a reason', 'review', 'hymnapp/playbulk/spec.md p5'),
            entry('in-log', 'none: a reason', 'review', 'unit/log.md v2'),
            entry('in-preview', 'none: a reason', 'review', 'unit/preview.md F1'),
            entry('in-a-review-folder', 'none: a reason', 'review', 'review-1/spec.md p5'),
          ),
        ).toEqual(
          ['in-spec', 'in-log', 'in-preview', 'in-a-review-folder'].map(
            (id) =>
              `${id}: a review entry cites no finding (<unit>/<review file> <id>, as F2 or m1)`,
          ),
        );
      }),
  );

  it.effect("refuses a reviewer's input as a cited finding: its prompt, brief or packet", () =>
    Effect.gen(function* () {
      expect(
        yield* problemsOf(
          entry('a-brief', 'none: a reason', 'review', 'unit/round-1-review-brief.md F1'),
          entry('a-prompt', 'none: a reason', 'review', 'unit/review-1-prompt.md F2'),
          entry('a-packet', 'none: a reason', 'review', 'unit/review-r1-packet.md F1'),
          entry(
            'a-brief-beside-its-review',
            'none: a reason',
            'review',
            'unit/r1-review-brief.md F1, unit/review-r1.md F1',
          ),
        ),
      ).toEqual(
        ['a-brief', 'a-prompt', 'a-packet'].map(
          (id) => `${id}: a review entry cites no finding (<unit>/<review file> <id>, as F2 or m1)`,
        ),
      );
    }),
  );

  it.effect('holds each name a guard lists after its file, up to the next file', () =>
    Effect.gen(function* () {
      expect(
        yield* problemsOf(
          entry('names-held', 'code: `src/thing.ts` `held`, `refuses a thing`'),
          entry('second-lost', 'code: `src/thing.ts` `held`, `refuses another`; `src/gone.ts` `x`'),
          entry(
            'next-file',
            'code: `src/thing.ts` `held`, `lint/fixtures/own.ts` `RED film/own-rule`, `call()`',
          ),
          entry('proof-lost', 'lint:no-console, proof `src/thing.ts` `refuses a thing`, `unheld`'),
        ),
      ).toEqual([
        'second-lost: src/thing.ts does not hold "refuses another"',
        'second-lost: no file src/gone.ts',
        'proof-lost: src/thing.ts does not hold "unheld"',
      ]);
    }),
  );

  it.effect('refuses a field given twice, since its reader keeps only the last', () =>
    Effect.gen(function* () {
      const fine = entry('twice', 'code: `src/thing.ts` `held`');
      expect(
        yield* problemsOf(fine.replace('- **Guard:**', '- **Guard:** none: lost\n- **Guard:**')),
      ).toEqual(['twice: Guard is given twice']);
    }),
  );

  it.effect.layer(BunServices.layer)(
    'routes each finding of a review to the entry that cites it, and reads its guard lines',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* repoWith(
            [
              '# Lessons',
              entry('folded', 'none: a reason', 'review', 'p6-x/review-1.md F1; the fix 1a2b3c'),
              entry('declined', 'none: a reason', 'review', 'p6-x/review-1.md F21'),
            ].join('\n'),
          );
          const unit = path.join(root, 'tmp', 'p6-x');
          yield* fs.makeDirectory(unit, { recursive: true });
          const review = path.join(unit, 'review-1.md');
          yield* fs.writeFileString(
            review,
            [
              'CHANGES',
              '### F1 High: the parts drop a file',
              '- **Guard class:** code',
              '- **Cheapest guard:** a test of partsOf',
              '### F2 Low: a comment overclaims',
              'Guard class: skill',
              '### F21 Medium: no guard named',
              'Cheapest guard: none',
              '### F3 Low: a name reads oddly',
              'Guard class: none',
              'Cheapest guard: none',
            ].join('\n'),
          );
          const routes = yield* reviewRoutes(root, [review]);
          expect(
            routes.map((route) => [
              route.ref,
              Option.getOrElse(route.by, () => 'unrouted'),
              route.classed,
              route.guarded,
              route.declined,
            ]),
          ).toEqual([
            ['p6-x/review-1.md F1', 'folded', true, true, false],
            ['p6-x/review-1.md F2', 'unrouted', true, false, false],
            ['p6-x/review-1.md F21', 'declined', false, true, false],
            ['p6-x/review-1.md F3', 'unrouted', true, true, true],
          ]);
        }),
      ),
  );
});

/** `bun check.ts <root>` over a scratch repo whose ledger holds `entries`: its stdout's lines and its exit code. */
const checkRun = (...entries: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const root = yield* repoWith(`# Lessons\n\n${entries.join('\n')}`);
    const child = yield* (yield* ChildProcessSpawner).spawn(
      ChildProcess.make('bun', [path.join(import.meta.dir, 'check.ts'), root], {
        forceKillAfter: '5 seconds',
      }),
    );
    const [out, code] = yield* Effect.all(
      [Stream.mkString(Stream.decodeText(child.stdout)), child.exitCode],
      { concurrency: 2 },
    );
    return { lines: out.trim().split('\n'), code: Number(code) };
  }).pipe(Effect.scoped, Effect.provide(BunServices.layer));

describe('the ledger check, as the gate and the pre-commit run it', () => {
  it.effect('prints each problem by its entry, then the counts, and exits 1', () =>
    Effect.gen(function* () {
      const { lines, code } = yield* checkRun(
        entry('held', 'code: `src/thing.ts` `held`'),
        entry('code-no-file', 'code: `src/gone.ts` `held`'),
        entry('review-uncited', 'none: a reason', 'review', 'hymnapp/playbulk/spec.md p5'),
      );
      expect(lines.slice(0, -1)).toEqual([
        'lessons code-no-file: no file src/gone.ts',
        'lessons review-uncited: a review entry cites no finding (<unit>/<review file> <id>, as F2 or m1)',
      ]);
      expect(lines.at(-1)).toMatch(/^lessons: 3 entries, 2 problem\(s\), \d+ ms$/);
      expect(code).toBe(1);
    }),
  );

  it.effect('prints the counts alone and exits 0 when every entry holds', () =>
    Effect.gen(function* () {
      const { lines, code } = yield* checkRun(entry('held', 'code: `src/thing.ts` `held`'));
      expect(lines).toEqual([
        expect.stringMatching(/^lessons: 1 entries, 0 problem\(s\), \d+ ms$/),
      ]);
      expect(code).toBe(0);
    }),
  );
});
