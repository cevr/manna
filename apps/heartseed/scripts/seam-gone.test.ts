/* oxlint-disable effect/noNodeBuiltinImport -- the test reads the package's tracked files from disk, synchronously, as `parts.test.ts` does. */

/**
 * No tracked file of the package names the test seam that would show Minutes
 * and Voice on Today (its context, its file or its name in prose), in its path
 * or its contents: the Settings sheet is the one place they show. The files are
 * git's listing of the package (the set `test:infra`'s inputs hash), less the
 * `infra/**` tests its inputs exclude, so the test reads nothing the cache does
 * not hash. A listing that fails, or that lacks a file every listing holds,
 * fails the test, so an empty or wrong listing cannot pass. Each name is built
 * from two pieces, so this file names none of them.
 */

import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const APP = join(import.meta.dir, '..');
const SELF = 'scripts/seam-gone.test.ts';

/** The name `head` `joint` `tail`, with the pattern that finds it: its pieces with `between` between them. */
const forbid = (head: string, tail: string, joint: string, flags: string, between = joint) => ({
  name: [head, tail].join(joint),
  pattern: new RegExp([head, tail].join(between), flags),
});

/** Each forbidden name; its prose form also found across a doc comment's line break. */
const NAMES = [
  forbid('Choices', 'OnToday', '', 'gu'),
  forbid('choices', 'OnToday', '', 'gu'),
  forbid('choices', 'seam', '-', 'giu'),
  forbid('choices', 'seam', ' ', 'giu', String.raw`\s+(?:\*\s+)?`),
];

/** The package's tracked files, by `git ls-files -z` in its folder. */
const listing = (folder: string) => {
  /* oxlint-disable-next-line effect/noGlobals -- the test lists the files git tracks, synchronously, before it reads them. */
  const run = Bun.spawnSync(['git', 'ls-files', '-z'], {
    cwd: folder,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return { code: run.exitCode, files: run.stdout.toString().split('\0').filter(Boolean) };
};

/** Whether `file` is a test under `infra/`, which `test:infra`'s inputs exclude. */
const unhashed = (file: string) => file.startsWith('infra/') && /\.test\.[^/]*$/u.test(file);

/** Each hit in `file`'s path and its contents, as `<path>: <name> in the path` or `<path>:<line>: <name>`. */
const hitsOf = (file: string): ReadonlyArray<string> => {
  const hits: Array<string> = [];
  for (const { name, pattern } of NAMES) {
    if (file.match(pattern)) hits.push(`${file}: ${name} in the path`);
  }
  const path = join(APP, file);
  if (!existsSync(path)) return hits;
  const text = readFileSync(path, 'utf8');
  for (const { name, pattern } of NAMES) {
    for (const match of text.matchAll(pattern)) {
      hits.push(`${file}:${text.slice(0, match.index).split('\n').length}: ${name}`);
    }
  }
  return hits;
};

describe('the seam of Today’s choices', () => {
  it('no tracked file of the package names the seam of Today’s choices, in its path or its contents', () => {
    const { code, files } = listing(APP);
    expect(code).toBe(0);
    expect(
      ['src/settings/choices.tsx', 'app/index.tsx', SELF].filter((file) => !files.includes(file)),
    ).toEqual([]);
    expect(files.filter((file) => !unhashed(file)).flatMap(hitsOf)).toEqual([]);
  });
});
