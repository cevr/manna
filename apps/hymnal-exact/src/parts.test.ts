/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals -- the test reads the app's own package.json, turbo.json and test files, by path under Bun; a Bun test in an Exact app's folder imports no effect, so no Schema JSON codec (docs/exact.md). */

/**
 * Each test file of the app is run by exactly one of its unit-test parts
 * (the scripts turbo's `test` depends on, README "The rules' tests"): a file
 * two parts take runs twice in the gate, and `test:budget` refuses the app;
 * a file no part takes never runs. A part's script is read as `bun test`
 * reads it: each `./` path it names takes the files at or under it, and each
 * `--path-ignore-patterns` path gives back the files at or under it. A
 * script this reader cannot read (a bare filter, a glob) is refused, so it
 * cannot pass by misreading one. The reader is tried first against planted
 * scripts, one of a folder two parts take, so a reader that finds no doubled
 * file cannot pass.
 */

import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';

const app = new URL('../', import.meta.url);

/** The words of `script` this reader cannot read: not `bun test`, a bare filter, a glob, an empty path. */
const unread = (script: string) => {
  const words = script.split(/\s+/u).filter((word) => word !== '');
  const head = [`not a bun test: ${script}`].filter(
    () => words.slice(0, 2).join(' ') !== 'bun test',
  );
  const rest = words.slice(2).filter((word, at, all) => all[at - 1] !== '--preload');
  return [
    ...head,
    ...rest.filter(
      (word) =>
        word !== '--preload' &&
        !word.startsWith('--path-ignore-patterns=') &&
        !word.startsWith('./'),
    ),
    ...rest
      .filter((word) => word.startsWith('./') || word.startsWith('--path-ignore-patterns='))
      .map((word) => word.replace(/^--path-ignore-patterns=|^\.\//u, ''))
      .filter((path) => path === '' || /[*?[\]{}!]/u.test(path)),
  ];
};

/** The files of `files` that `script`, a `bun test` command this reader reads, runs. */
const taken = (script: string, files: ReadonlyArray<string>): ReadonlyArray<string> => {
  const words = script.split(/\s+/u).filter((_, at, all) => all[at - 1] !== '--preload');
  const roots = words.filter((word) => word.startsWith('./')).map((word) => word.slice(2));
  const ignored = words
    .filter((word) => word.startsWith('--path-ignore-patterns='))
    .map((word) => word.slice('--path-ignore-patterns='.length));
  const under = (paths: ReadonlyArray<string>, file: string) =>
    paths.some((path) => file === path || file.startsWith(`${path.replace(/\/$/u, '')}/`));
  return files.filter((file) => under(roots, file) && !under(ignored, file));
};

/** Each word of `scripts` this reader cannot read, then each file of `files` that no part or more than one part takes, with the parts that take it. */
const misrun = (scripts: Readonly<Record<string, string>>, files: ReadonlyArray<string>) => [
  ...Object.entries(scripts).flatMap(([name, script]) =>
    unread(script).map((word) => `${name} unread: ${word}`),
  ),
  ...files.flatMap((file) => {
    const by = Object.entries(scripts)
      .filter(([, script]) => taken(script, files).includes(file))
      .map(([name]) => name);
    return [`${file} (${by.join(', ') || 'no part'})`].filter(() => by.length !== 1);
  }),
];

const files = readdirSync(new URL('src', app), { recursive: true })
  .map((file) => `src/${String(file)}`)
  .filter((file) => /\.test\.tsx?$/u.test(file))
  .toSorted();
const { scripts } = JSON.parse(readFileSync(new URL('package.json', app), 'utf8')) as {
  scripts: Record<string, string>;
};
const { tasks } = JSON.parse(readFileSync(new URL('turbo.json', app), 'utf8')) as {
  tasks: { test: { dependsOn: ReadonlyArray<string> } };
};
const parts = Object.fromEntries(
  tasks.test.dependsOn
    .filter((name) => !name.startsWith('$') && !name.includes('#') && !name.startsWith('^'))
    .map((name) => [name, scripts[name] ?? '']),
);

describe("the app's unit-test parts", () => {
  it('find a file two parts take, and one no part takes', () => {
    const planted = ['src/a.test.ts', 'src/web/cache.test.ts', 'src/web/place.test.ts'];
    expect(
      misrun(
        {
          'test:app':
            'bun test --preload ./src/test/setup.ts --path-ignore-patterns=src/web/place.test.ts ./src',
          'test:web': 'bun test --preload ./src/test/setup.ts ./src/web',
        },
        planted,
      ),
    ).toEqual(['src/web/cache.test.ts (test:app, test:web)']);
    expect(misrun({ 'test:web': 'bun test ./src/web' }, planted)).toEqual([
      'src/a.test.ts (no part)',
    ]);
    expect(misrun({ 'test:x': 'bun test web ./src' }, planted)).toEqual(['test:x unread: web']);
    expect(misrun({ 'test:x': 'bun test --path-ignore-patterns=**/a ./src' }, planted)).toEqual([
      'test:x unread: **/a',
    ]);
    expect(misrun({ 'test:x': 'vitest ./src' }, planted)).toEqual([
      'test:x unread: not a bun test: vitest ./src',
    ]);
  });

  it('are the scripts turbo’s test runs', () => {
    expect(Object.keys(parts).length).toBeGreaterThan(5);
    expect(Object.entries(parts).filter(([, script]) => script === '')).toEqual([]);
  });

  it('take each test file of the app exactly once', () => {
    expect(files.length).toBeGreaterThan(40);
    expect(misrun(parts, files)).toEqual([]);
  });
});
