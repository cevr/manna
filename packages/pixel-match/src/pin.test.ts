/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noThrowStatement, effect/noNewError, effect/noAsyncFunction, effect/noNewPromise, effect/noTestLifecycleHooks -- the pin is a file in a git checkout: the test makes a scratch repository of its own, commits under the One paths, runs the command line in it (three runs at once, to stay inside the test budget), and removes it after the file's tests whether they pass or fail. */
import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { Option } from 'effect';

import { run } from './ios.ts';
import { driftLine, driftOf, readNeutral, readPin, refKey, writePin } from './pin.ts';

const scratch = mkdtempSync(`${tmpdir()}/pixel-pin-`);
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const git = (args: ReadonlyArray<string>) =>
  run(
    [
      'git',
      ...['-c', 'user.name=pin', '-c', 'user.email=pin@example.com'],
      ...['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/nonexistent/pixel-pin-hooks'],
      ...args,
    ],
    scratch,
  );

/** Commits the files as they are; the commit's 12-digit hash. */
const commitAll = (message: string) => {
  git(['add', '-A']);
  git(['commit', '-q', '-m', message]);
  return git(['rev-parse', '--short=12', 'HEAD']).trim();
};

/** Writes `file` in the scratch repository and commits it; the commit's 12-digit hash. */
const commit = (file: string, text: string) => {
  mkdirSync(dirname(join(scratch, file)), { recursive: true });
  writeFileSync(join(scratch, file), text);
  return commitAll(`edit ${file}`);
};

const ledger = join(scratch, 'packages', 'pixel-match', 'render-neutral');

git(['init', '-q']);
const first = commit('apps/hymnal/src/a.ts', 'one');
mkdirSync(join(scratch, 'packages', 'pixel-match'), { recursive: true });
writePin(scratch, first);
commitAll('pin');
commit('docs/notes.md', 'not a One path');

/** The drift the scratch repository holds now, with the ledger as it is on disk; a test that expects one fails without it. */
const driftNow = () => {
  const drift = driftOf(git, readPin(scratch), readNeutral(scratch));
  if (Option.isNone(drift)) throw new Error('no drift from the pin');
  return drift;
};

/** The row `ref` is asked for: no app has it, so a refusal that regressed would still capture nothing, and stop at the unknown row with another reason. */
const NO_ROW = 'no-such-row';

/** Runs `pixel <args>` in the scratch repository; its exit code and stderr. */
const cli = async (...args: ReadonlyArray<string>) => {
  const child = Bun.spawn(['bun', join(import.meta.dir, 'cli.ts'), ...args], {
    cwd: scratch,
    env: { ...process.env, PIXEL_REF: join(scratch, 'ref') },
    stdout: 'ignore',
    stderr: 'pipe',
  });
  const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  return { code, stderr };
};

describe('the pinned One commit', () => {
  test('the key is the committed pin, and a commit outside the One paths, of a test or of a port declaration is no drift', () => {
    commit('apps/heartseed/exact/field.d.ts', 'declared');
    commit('apps/hymnal/src/a.test.ts', 'tested');
    commit('apps/hymnal/src/b.test.tsx', 'tested');
    expect(readPin(scratch)).toBe(first);
    expect(readNeutral(scratch)).toEqual([]);
    expect(Option.isNone(driftOf(git, first, []))).toBe(true);
    expect(refKey(first, Option.none(), false)).toEqual({ _tag: 'Key', one: first, repin: false });
  });

  test('a later commit under apps/hymnal leaves the pin and names the drift and its files', () => {
    const later = commit('apps/hymnal/src/b.ts', 'two');
    const drift = driftNow();
    expect(drift.value).toEqual({
      pinned: first,
      latest: later,
      unlisted: [later],
      changed: ['apps/hymnal/src/b.ts'],
    });
    expect(driftLine(drift.value)).toContain(`pinned ${first}, latest ${later}`);
    expect(refKey(first, drift, false)._tag).toBe('Refused');
    expect(refKey(first, drift, true)).toEqual({ _tag: 'Key', one: later, repin: true });
  });

  test('a pin that is no 12-digit commit is refused, never read as matching every commit', () => {
    const file = join(scratch, 'packages', 'pixel-match', 'one-commit');
    for (const text of ['', '\n', 'e6368c03', 'not a commit!', `${first}0`]) {
      writeFileSync(file, text);
      expect(() => readPin(scratch)).toThrow('is no One commit');
    }
    writePin(scratch, first);
    expect(readPin(scratch)).toBe(first);
  });

  test('a ledger line with no commit or no reason is refused, never read as listing nothing or everything', () => {
    for (const text of [
      'abc reason',
      `${first}`,
      `${first}   `,
      `${first}0 reason`,
      'reason only',
    ]) {
      writeFileSync(ledger, text);
      expect(() => readNeutral(scratch)).toThrow('is no entry');
    }
    writeFileSync(ledger, `\n${first} a move\n\n`);
    expect(readNeutral(scratch)).toEqual([first]);
  });

  test('a commit listed render-neutral keeps the pin, and an unlisted One change after it still refuses, named alone', () => {
    const listed = driftNow().value.latest;
    writeFileSync(ledger, `${listed} move: b, unchanged\n`);
    expect(Option.isNone(driftOf(git, first, readNeutral(scratch)))).toBe(true);
    commitAll('list b');
    expect(Option.isNone(driftOf(git, first, readNeutral(scratch)))).toBe(true);

    const planted = commit('apps/hymnal/src/b.ts', 'drawn otherwise');
    const drift = driftNow();
    expect(drift.value).toEqual({
      pinned: first,
      latest: planted,
      unlisted: [planted],
      changed: ['apps/hymnal/src/b.ts'],
    });
    const refused = refKey(first, drift, false);
    expect(refused).toEqual({
      _tag: 'Refused',
      reason: expect.stringContaining(`One moved past the pin ${first} by ${planted};`),
    });
  });

  test('on a drift, report keeps the pin and says the drift, ref refuses without --repin, and an empty flag value refuses', async () => {
    const [report, refused, empty, unknown] = await Promise.all([
      cli('report'),
      cli('ref', 'hymnal', NO_ROW),
      cli('shot', 'hymnal', 'about.page', '--size'),
      cli('shot', 'hymnal', NO_ROW),
    ]);
    expect([unknown.code, unknown.stderr]).toEqual([
      1,
      expect.stringContaining(`pixel: no row ${NO_ROW} in hymnal`),
    ]);
    expect([empty.code, empty.stderr]).toEqual([
      1,
      expect.stringContaining('--size needs a value'),
    ]);
    expect(report.code).toBe(0);
    expect(report.stderr).toContain('changed by them: apps/hymnal/src/b.ts');
    const written = JSON.parse(
      readFileSync(join(scratch, 'tmp', 'pixel-match', 'report.json'), 'utf8'),
    ) as { one: string };
    expect(written.one).toBe(first);

    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain('refused, One moved past the pin');
    expect(readPin(scratch)).toBe(first);
  });

  test('with every commit since the pin listed, ref passes its pin check and stops only at the unknown row', async () => {
    const planted = driftNow().value.latest;
    writeFileSync(ledger, `${readFileSync(ledger, 'utf8')}${planted} move: for the test\n`);
    const ref = await cli('ref', 'hymnal', NO_ROW);
    expect([ref.code, ref.stderr]).toEqual([1, `pixel: no row ${NO_ROW} in hymnal\n`]);
  });

  test('a new pin empties the ledger, whose commits all lie before it', () => {
    writePin(scratch, first);
    expect(readNeutral(scratch)).toEqual([]);
  });
});
