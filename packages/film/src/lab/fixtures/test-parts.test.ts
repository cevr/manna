import { Glob } from 'bun';
import { describe, expect, test } from 'bun:test';
import film from '../../../package.json' with { type: 'json' };
import turbo from '../../../turbo.json' with { type: 'json' };

// The unit tests run as three parts, each a script and a task of this
// workspace's `turbo.json`: `test:lab` (`src/lab` and the lab tools of
// `src/tools`), `test:tools` (the rest of `src/tools`) and `test:engine`
// (everything else under `src` and `lint`). The lab tools are written in
// three places: the files `test:lab` names, the files `test:tools` ignores,
// and the test files `test:tools`'s turbo inputs leave out. A name in the
// first and not the second runs twice; one in the second and not the first
// runs in no part; one `test:tools` runs that its inputs leave out is a
// cached pass that an edit of that file never misses. The reach check
// (`packages/scripts`, `test-budget/reach.ts`) catches the first two at
// `test:budget`; this holds all three lists to one another at the gate.
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

describe("the film unit tests' parts", () => {
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
