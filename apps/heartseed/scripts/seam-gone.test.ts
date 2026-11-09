/* oxlint-disable effect/noNodeBuiltinImport -- the test reads the package's files from disk, synchronously, as `parts.test.ts` does. */

/**
 * No file of the package names the test seam that would show Minutes and
 * Voice on Today (its context, its file or its name in prose), in its path or
 * its contents, in any casing and with any separators between its words: the
 * Settings sheet is the one place they show. The files are git's listing of
 * the package, tracked and untracked but not ignored (the set `test:infra`'s
 * inputs hash), less the `infra/**` tests its inputs exclude, so a file not yet
 * added is read too, and the test reads nothing the cache does not hash. A
 * listing that fails, or that lacks a file every listing holds, fails the test,
 * so an empty or wrong listing cannot pass. Each name is built from its words,
 * so this file names none of them.
 */

import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const APP = join(import.meta.dir, '..');
const SELF = 'scripts/seam-gone.test.ts';

/**
 * Each forbidden name, by its words, found in any casing with `between` between
 * them. The context's name admits only `-` and `_` between its words, so prose
 * that speaks of the reader's choices on Today is not the seam; the seam's name
 * admits whitespace too, and a doc comment's line break.
 */
const NAMES = [
  { words: ['choices', 'on', 'today'], between: '[-_]*' },
  { words: ['choices', 'seam'], between: String.raw`[-_\s]*(?:\*\s+)?` },
].map(({ words, between }) => ({
  name: words.join(' '),
  pattern: new RegExp(words.join(between), 'giu'),
}));

/** Each forbidden name `text` holds, once per hit, with the index it starts at. */
const found = (text: string) =>
  NAMES.flatMap(({ name, pattern }) =>
    [...text.matchAll(pattern)].map((match) => ({ name, index: match.index })),
  );

/** The package's files that git tracks or would track, by `git ls-files` in its folder. */
const listing = (folder: string) => {
  /* oxlint-disable-next-line effect/noGlobals -- the test lists the files git tracks or would track, synchronously, before it reads them. */
  const run = Bun.spawnSync(
    ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: folder,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  return { code: run.exitCode, files: run.stdout.toString().split('\0').filter(Boolean) };
};

/** Whether `file` is a test under `infra/`, which `test:infra`'s inputs exclude. */
const unhashed = (file: string) => file.startsWith('infra/') && /\.test\.[^/]*$/u.test(file);

/** Each hit in `file`'s path and its contents, as `<path>: <name> in the path` or `<path>:<line>: <name>`. */
const hitsOf = (file: string): ReadonlyArray<string> => {
  const inPath = found(file).map(({ name }) => `${file}: ${name} in the path`);
  const path = join(APP, file);
  if (!existsSync(path)) return inPath;
  const text = readFileSync(path, 'utf8');
  return [
    ...inPath,
    ...found(text).map(
      ({ name, index }) => `${file}:${text.slice(0, index).split('\n').length}: ${name}`,
    ),
  ];
};

const lower = (word: string) => word.toLowerCase();
const upper = (word: string) => word.toUpperCase();
const title = (word: string) => upper(word.slice(0, 1)) + lower(word.slice(1));
const ragged = (word: string) =>
  word.replace(/(.)(.?)/gu, (_, odd: string, even: string) => upper(odd) + lower(even));

type Case = (word: string) => string;

/** Each casing of a name's words, as the case of its first word and the case of the rest: one case for every word, or camel case. */
const CASINGS: ReadonlyArray<readonly [Case, Case]> = [
  [lower, lower],
  [upper, upper],
  [title, title],
  [ragged, ragged],
  [lower, title],
  [title, upper],
];

/** Every way of writing `words` in each casing with each separator. */
const writings = (words: ReadonlyArray<string>, separators: ReadonlyArray<string>) =>
  CASINGS.flatMap(([first, rest]) =>
    separators.map((separator) =>
      [...words.slice(0, 1).map(first), ...words.slice(1).map(rest)].join(separator),
    ),
  );

describe('the seam of Today’s choices', () => {
  it('no file of the package, tracked or not ignored, names the seam of Today’s choices, in its path or its contents', () => {
    const { code, files } = listing(APP);
    expect(code).toBe(0);
    expect(
      ['src/settings/choices.tsx', 'app/index.tsx', SELF].filter((file) => !files.includes(file)),
    ).toEqual([]);
    expect(files.filter((file) => !unhashed(file)).flatMap(hitsOf)).toEqual([]);
  });

  it('finds each name in any casing, with any separators between its words, in a path or in a line of code', () => {
    const named = [
      ...writings(['choices', 'on', 'today'], ['', '-', '_', '__', '-_']),
      ...writings(['choices', 'seam'], ['', '-', '_', ' ', '  ', '\n * ', '_-']),
    ];
    expect(named).toHaveLength(72);
    const missed = named.flatMap((name) =>
      [
        `src/test/${name}.tsx`,
        `export const ${name} = new WeakSet<Element>();`,
        `import { ${name} } from './x';`,
      ].filter((text) => found(text).length !== 1),
    );
    expect(missed).toEqual([]);
  });

  it('leaves prose about the reader’s choices on Today, and other choices, alone', () => {
    const prose = [
      ...writings(['choices', 'on', 'today'], [' ']),
      ...writings(['choices', 'in', 'the', 'seam'], [' ']),
      ...writings(['choices', 'sheet'], ['', '-']),
    ];
    expect(prose.filter((text) => found(text).length > 0)).toEqual([]);
  });
});
