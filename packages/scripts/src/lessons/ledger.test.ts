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

/** `files` written under `root`, each by its path from it. */
const writeAll = (root: string, files: Readonly<Record<string, string>>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* Effect.forEach(Object.entries(files), ([file, text]) =>
      Effect.gen(function* () {
        yield* fs.makeDirectory(path.dirname(path.join(root, file)), { recursive: true });
        yield* fs.writeFileString(path.join(root, file), text);
      }),
    );
  });

/** A scratch repo with `ledger` as its docs/lessons.md beside `FILES` and `more`, and its root. */
const repoWith = (ledger: string, more: Readonly<Record<string, string>> = {}) =>
  Effect.gen(function* () {
    const root = yield* (yield* FileSystem.FileSystem).makeTempDirectoryScoped({
      prefix: 'lessons-',
    });
    yield* writeAll(root, { ...FILES, 'docs/lessons.md': ledger, ...more });
    return root;
  });

/** The ledger of the scratch repos whose entries are kept in their own files. */
const PREAMBLE = `# Lessons\n\n## A section\n\n${entry('in-the-ledger', 'code: `src/thing.ts` `held`')}`;

/** The problem of entry `id` whose guard quotes `words` that `file` no longer holds, with the rename rule. */
const notHeld = (id: string, file: string, words: string) =>
  `${id}: ${file} does not hold "${words}"; renamed, its new words replace these in this Guard, in the same commit`;

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
        notHeld('lint-proof-lost', 'src/thing.ts', 'refuses another'),
        'judged-warns: judged/warns does not gate: a rule that warns guards nothing',
        'judged-other-corpus: judged/warns.json is not the corpus of gates',
        notHeld('skill-reworded', 'skills/SKILL.md', 'Say what it does.'),
        notHeld('code-in-comment', 'src/thing.ts', 'unheld'),
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

  it.effect(
    'reads a finding in a counsel, codex, critique, audit or followups output, and none in its input',
    () =>
      Effect.gen(function* () {
        expect(
          yield* problemsOf(
            entry('in-counsel', 'none: a reason', 'review', 'unit/round-3-counsel.md F1'),
            entry('in-counsel-codex', 'none: a reason', 'review', 'unit/counsel-codex.md F2'),
            entry('in-codex', 'none: a reason', 'review', 'review-1/codex.md C1'),
            entry('in-critique', 'none: a reason', 'review', 'unit/critique-r2.md F1'),
            entry(
              'in-dotted-critique',
              'none: a reason',
              'review',
              'unit/turnaround-threeQuarterLeft.critique.md F2',
            ),
            entry('in-audit', 'none: a reason', 'review', 'unit/semantic-audit.md A1'),
            entry('in-followups', 'none: a reason', 'review', 'unit/followups.md F1'),
            entry(
              'in-review-followups',
              'none: a reason',
              'review',
              'unit/review-followups-r1.md F2',
            ),
            entry('in-counsel-packet', 'none: a reason', 'review', 'unit/counsel-packet.md F1'),
            entry(
              'in-critique-prompt',
              'none: a reason',
              'review',
              'unit/critique-r2-a-prompt.md F1',
            ),
            entry('in-followups-brief', 'none: a reason', 'review', 'unit/brief-followups.md F1'),
            entry('in-dotted-spec', 'none: a reason', 'review', 'unit/film.spec.md p5'),
          ),
        ).toEqual(
          ['in-counsel-packet', 'in-critique-prompt', 'in-followups-brief', 'in-dotted-spec'].map(
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
        notHeld('second-lost', 'src/thing.ts', 'refuses another'),
        'second-lost: no file src/gone.ts',
        notHeld('proof-lost', 'src/thing.ts', 'unheld'),
      ]);
    }),
  );

  it.effect(
    'refuses a renamed title its Guard still quotes, naming the rule that the Guard takes the new words in the same commit, and holds the Guard that took them',
    () =>
      Effect.gen(function* () {
        const before = 'code: `src/thing.ts` `refuses a thing`';
        const after = 'code: `src/thing.ts` `refuses a stale thing`';
        const renamed = (guard: string) =>
          Effect.gen(function* () {
            const root = yield* repoWith(
              `# Lessons\n\n## A section\n\n${entry('a-rename', guard)}`,
            );
            const fs = yield* FileSystem.FileSystem;
            const path = yield* Path.Path;
            yield* fs.writeFileString(
              path.join(root, 'src/thing.ts'),
              "test('refuses a stale thing', () => {});\n",
            );
            return (yield* ledgerProblems(root)).problems;
          }).pipe(Effect.scoped, Effect.provide(BunServices.layer));
        expect(yield* renamed(before)).toEqual([
          notHeld('a-rename', 'src/thing.ts', 'refuses a thing'),
        ]);
        expect(yield* renamed(after)).toEqual([]);
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

/**
 * git's settings for the scratch repo at `root`: its own `.git` whatever repo
 * runs the test, no system or user config (so no hook and no signing), one author.
 */
const gitEnv = (root: string) => ({
  GIT_DIR: `${root}/.git`,
  GIT_WORK_TREE: root,
  GIT_INDEX_FILE: `${root}/.git/index`,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_AUTHOR_NAME: 'ledger',
  GIT_AUTHOR_EMAIL: 'ledger@example.invalid',
  GIT_COMMITTER_NAME: 'ledger',
  GIT_COMMITTER_EMAIL: 'ledger@example.invalid',
});

/** `git <args>` in `root`: its exit code. */
const git = (root: string, ...args: ReadonlyArray<string>) =>
  Effect.scoped(
    Effect.flatMap(
      Effect.flatMap(ChildProcessSpawner, (spawner) =>
        spawner.spawn(
          ChildProcess.make('git', args, {
            cwd: root,
            env: gitEnv(root),
            extendEnv: true,
            stdout: 'ignore',
            stderr: 'ignore',
            forceKillAfter: '5 seconds',
          }),
        ),
      ),
      (child) => child.exitCode,
    ),
  ).pipe(Effect.map(Number));

/** `git <args>` in `root`, failing the test, by the command, unless it exits 0. */
const gitOk = (root: string, ...args: ReadonlyArray<string>) =>
  Effect.map(git(root, ...args), (code) => {
    expect({ git: args.join(' '), code }).toEqual({ git: args.join(' '), code: 0 });
  });

describe("the ledger's entries kept one to a file under docs/lessons/", () => {
  it.effect(
    'merges two branches that each add an entry from one base with no conflict, into a ledger the check holds',
    () =>
      Effect.gen(function* () {
        const root = yield* repoWith(PREAMBLE);
        yield* gitOk(root, 'init', '-q', '-b', 'main');
        yield* gitOk(root, 'add', '-A');
        yield* gitOk(root, 'commit', '-q', '-m', 'base');
        const addOn = (branch: string, id: string) =>
          Effect.gen(function* () {
            yield* gitOk(root, 'checkout', '-q', '-b', branch, 'main');
            yield* writeAll(root, {
              [`docs/lessons/${id}.md`]: entry(id, 'code: `src/thing.ts` `held`'),
            });
            yield* gitOk(root, 'add', '-A');
            yield* gitOk(root, 'commit', '-q', '-m', id);
          });
        yield* addOn('one', 'one-entry');
        yield* addOn('two', 'two-entry');
        expect(yield* git(root, 'merge', '-q', '--no-edit', 'one')).toBe(0);
        expect(yield* ledgerProblems(root)).toEqual({ entries: 3, problems: [] });
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect("holds an entry's own file to its fields and its guard, as the ledger's", () =>
    Effect.gen(function* () {
      const root = yield* repoWith(PREAMBLE, {
        'docs/lessons/held.md': entry('held', 'code: `src/thing.ts` `held`'),
        'docs/lessons/lost.md': entry('lost', 'code: `src/thing.ts` `unheld`'),
        'docs/lessons/no-cause.md': entry('no-cause', 'none: a reason').replace(
          '- **Cause:** Not recorded.\n',
          '',
        ),
      });
      expect(yield* ledgerProblems(root)).toEqual({
        entries: 4,
        problems: [notHeld('lost', 'src/thing.ts', 'unheld'), 'no-cause: no Cause'],
      });
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect(
    "refuses an entry's file that is not its one entry headed by its name, an id given twice, and a conflict marker by its file's line",
    () =>
      Effect.gen(function* () {
        const form =
          "an entry's file holds that one entry, headed `### <id>` on its first line, and is named <id>.md";
        const root = yield* repoWith(PREAMBLE, {
          'docs/lessons/misnamed.md': entry('other-name', 'none: a reason'),
          'docs/lessons/two.md': `${entry('two', 'none: a reason')}\n${entry('two-more', 'none: a reason')}`,
          'docs/lessons/preamble.md': `Some words first.\n\n${entry('preamble', 'none: a reason')}`,
          'docs/lessons/in-the-ledger.md': entry('in-the-ledger', 'none: a reason'),
          'docs/lessons/marked.md': `${entry('marked', 'none: a reason')}<<<<<<< HEAD\n`,
          'docs/lessons/notes.txt': entry('notes', 'none: a reason'),
        });
        expect((yield* ledgerProblems(root)).problems).toEqual([
          'docs/lessons/marked.md:10: a conflict marker is left: <<<<<<< HEAD',
          `docs/lessons/misnamed.md: ${form}`,
          `docs/lessons/notes.txt: ${form}`,
          `docs/lessons/preamble.md: ${form}`,
          `docs/lessons/two.md: ${form}`,
          'in-the-ledger: the id heads more than one entry',
        ]);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect("routes a review's finding to the entry its own file keeps", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const root = yield* repoWith(PREAMBLE, {
        'docs/lessons/folded.md': entry(
          'folded',
          'none: a reason',
          'review',
          'p6-x/review-1.md F1',
        ),
        'tmp/p6-x/review-1.md': '### F1 High: a\nGuard class: none\nCheapest guard: none\n',
      });
      const routes = yield* reviewRoutes(root, [path.join(root, 'tmp/p6-x/review-1.md')]);
      expect(
        routes.map((route) => [route.ref, Option.getOrElse(route.by, () => 'unrouted')]),
      ).toEqual([['p6-x/review-1.md F1', 'folded']]);
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
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
