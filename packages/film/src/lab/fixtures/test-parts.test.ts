import { Glob } from 'bun';
import { describe, expect, test } from 'bun:test';
import film from '../../../package.json' with { type: 'json' };
import turbo from '../../../turbo.json' with { type: 'json' };

const scripts: Readonly<Record<string, string>> = film.scripts;
const words = (script: string) => (scripts[script] ?? '').split(/\s+/);

/** The names `pattern` captures among `items`, sorted. */
const captured = (items: ReadonlyArray<string>, pattern: RegExp) =>
  items.flatMap((item) => item.match(pattern)?.slice(1, 2) ?? []).toSorted();

const labNamed = captured(words('test:lab'), /^\.\/src\/tools\/([^/]+)\.test\.ts$/);
const toolsIgnored = captured(
  words('test:tools'),
  /^--path-ignore-patterns=src\/tools\/([^/*]+)\.test\.ts$/,
);
const toolsUnhashed = captured(
  turbo.tasks['test:tools'].inputs,
  /^!src\/tools\/\{(.+)\}\.test\.ts$/,
)
  .flatMap((names) => names.split(','))
  .toSorted();

/** The flags of `bun test` whose value is the next word. */
const TAKES_VALUE = new Set(['--preload']);

/** The paths a part's script runs: the words after `bun test` that are no flag and no flag's value. */
const positional = (script: string) =>
  words(script)
    .slice(2)
    .filter((word, at, all) => !word.startsWith('-') && !TAKES_VALUE.has(all[at - 1] ?? ''));

describe("the film unit tests' parts", () => {
  test('each part runs its own roots, so no test folder falls out of every part', () => {
    expect(
      ['test:lab', 'test:tools', 'test:engine'].map((part) => words(part).slice(0, 2)),
    ).toEqual([
      ['bun', 'test'],
      ['bun', 'test'],
      ['bun', 'test'],
    ]);
    expect(positional('test:lab').toSorted()).toEqual(
      ['./src/lab', ...labNamed.map((name) => `./src/tools/${name}.test.ts`)].toSorted(),
    );
    expect(positional('test:tools')).toEqual(['./src/tools']);
    expect(positional('test:engine')).toEqual(['src', 'lint']);
  });

  test('the lab tools test:lab names are the ones test:tools ignores and its turbo inputs leave out', () => {
    expect(labNamed.length).toBeGreaterThan(0);
    expect(new Set(labNamed).size).toBe(labNamed.length);
    expect(toolsIgnored).toEqual(labNamed);
    expect(toolsUnhashed).toEqual(labNamed);
  });

  test('each lab tool is a test file directly in src/tools', () => {
    const flat = new Set(
      [...new Glob('*.test.ts').scanSync({ cwd: `${import.meta.dir}/../../tools` })].map((file) =>
        file.replace(/\.test\.ts$/, ''),
      ),
    );
    expect(labNamed.filter((name) => !flat.has(name))).toEqual([]);
  });

  test('the folders test:engine ignores are the ones its turbo inputs leave the tests of out', () => {
    const ignored = captured(words('test:engine'), /^--path-ignore-patterns=(src\/[^*'/]+)$/);
    expect(ignored).toEqual(['src/lab', 'src/tools']);
    expect(
      turbo.tasks['test:engine'].inputs.filter((input) => input.startsWith('!')).toSorted(),
    ).toEqual(ignored.map((folder) => `!${folder}/**/*.test.*`));
  });
});
