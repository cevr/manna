/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noThrowStatement, effect/noNewError, effect/noAsyncFunction, effect/noNewPromise -- the pin is a file in a git checkout: the test makes a scratch repository of its own, commits under the One paths, runs the command line in it (two runs at once, to stay inside the test budget), and removes it once read. */
import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { Option } from 'effect';

import { run } from './ios.ts';
import { driftLine, driftOf, readPin, refKey, writePin } from './pin.ts';

const scratch = mkdtempSync(`${tmpdir()}/pixel-pin-`);

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

git(['init', '-q']);
const first = commit('apps/hymnal/src/a.ts', 'one');
mkdirSync(join(scratch, 'packages', 'pixel-match'), { recursive: true });
writePin(scratch, first);
commitAll('pin');
commit('docs/notes.md', 'not a One path');

/** The drift the scratch repository holds now; a test that expects one fails without it. */
const driftNow = () => {
  const drift = driftOf(git, readPin(scratch));
  if (Option.isNone(drift)) throw new Error('no drift from the pin');
  return drift;
};

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
  test('the key is the committed pin, and a commit outside the One paths is no drift', () => {
    expect(readPin(scratch)).toBe(first);
    expect(Option.isNone(driftOf(git, first))).toBe(true);
    expect(refKey(first, Option.none(), false)).toEqual({ _tag: 'Key', one: first, repin: false });
  });

  test('a later commit under apps/hymnal leaves the pin and names the drift and its files', () => {
    const later = commit('apps/hymnal/src/b.ts', 'two');
    const drift = driftNow();
    expect(drift.value).toEqual({
      pinned: first,
      latest: later,
      changed: ['apps/hymnal/src/b.ts'],
    });
    expect(driftLine(drift.value)).toContain(`pinned ${first}, latest ${later}`);
    expect(refKey(first, drift, false)._tag).toBe('Refused');
    expect(refKey(first, drift, true)).toEqual({ _tag: 'Key', one: later, repin: true });
  });

  test('on a drift, report keeps the pin and says the drift, and ref refuses without --repin', async () => {
    const [report, refused] = await Promise.all([cli('report'), cli('ref', 'hymnal', 'home')]);
    expect(report.code).toBe(0);
    expect(report.stderr).toContain('changed since the pin: apps/hymnal/src/b.ts');
    const written = JSON.parse(
      readFileSync(join(scratch, 'tmp', 'pixel-match', 'report.json'), 'utf8'),
    ) as { one: string };
    expect(written.one).toBe(first);

    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain('refused, One moved past the pin');
    expect(readPin(scratch)).toBe(first);
    rmSync(scratch, { recursive: true, force: true });
  });
});
