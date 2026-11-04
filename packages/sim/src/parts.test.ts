/**
 * The package's unit tests run as parts, each a turbo task the gate runs:
 * the `test:<part>` scripts the commandless `test` of `turbo.json` depends
 * on, with no `test` script of its own. Together the parts run every
 * unit-test file under `src` once, and each ignores every slow file.
 *
 * Each part's command is read with a grammar for the forms the parts use
 * (`bun test`, `--parallel=<n>`, the slow-file pattern,
 * `--path-ignore-patterns=src/<file>`, `./src` and `./src/<file>`); any
 * other word refuses the command, so a part written another way cannot pass
 * by being read wrong.
 */
import { Glob } from 'bun';
import { describe, expect, it } from 'bun:test';

import sim from '../package.json' with { type: 'json' };
import turbo from '../turbo.json' with { type: 'json' };

const PARTS = ['test:host', 'test:drive'] as const;
const SLOW = "--path-ignore-patterns='**/*.slow.test.*'";

const scripts: Readonly<Record<string, string>> = sim.scripts;

/** A part's command, read: the paths it names and the paths it ignores, each from the package. */
interface Part {
  readonly slowIgnored: boolean;
  readonly paths: ReadonlyArray<string>;
  readonly ignored: ReadonlyArray<string>;
  readonly refused: ReadonlyArray<string>;
}

const read = (script: string): Part => {
  const words = (scripts[script] ?? '').split(/\s+/);
  const rest = words.slice(2);
  return {
    slowIgnored: rest.includes(SLOW),
    paths: rest
      .filter((word) => /^\.\/src(\/[\w.]+\.test\.ts)?$/.test(word))
      .map((w) => w.slice(2)),
    ignored: rest.flatMap(
      (word) => word.match(/^--path-ignore-patterns=(src\/[\w.]+\.test\.ts)$/)?.slice(1) ?? [],
    ),
    refused: [
      ...[`${words[0]} ${words[1]}`].filter((runner) => runner !== 'bun test'),
      ...rest.filter(
        (word) =>
          word !== SLOW &&
          !/^--parallel=\d+$/.test(word) &&
          !/^--path-ignore-patterns=src\/[\w.]+\.test\.ts$/.test(word) &&
          !/^\.\/src(\/[\w.]+\.test\.ts)?$/.test(word),
      ),
    ],
  };
};

/** Whether `part` runs `file` (a path from the package). */
const takes = (part: Part, file: string) =>
  part.paths.some((path) => path === file || file.startsWith(`${path}/`)) &&
  !part.ignored.includes(file);

const unitFiles = [...new Glob('src/**/*.test.ts').scanSync({ cwd: `${import.meta.dir}/..` })]
  .filter((file) => !file.includes('.slow.test.'))
  .toSorted();

describe('the unit-test parts', () => {
  it("are the commandless test task's dependencies, with no test script", () => {
    expect(turbo.tasks.test.dependsOn).toEqual(['$TURBO_EXTENDS$', ...PARTS]);
    expect(
      Object.keys(scripts)
        .filter((name) => /^test(:|$)/.test(name))
        .toSorted(),
    ).toEqual([...PARTS, 'test:slow'].toSorted());
  });

  it('are read whole, and each ignores every slow file', () => {
    expect(
      PARTS.map((name) => ({ name, ...read(name) })).filter(
        (part) => part.refused.length > 0 || !part.slowIgnored,
      ),
    ).toEqual([]);
  });

  it('take every unit-test file, each in exactly one part', () => {
    expect(unitFiles.length).toBeGreaterThan(0);
    const owners = unitFiles.map((file) => ({
      file,
      parts: PARTS.filter((name) => takes(read(name), file)),
    }));
    expect(owners.filter((owner) => owner.parts.length !== 1)).toEqual([]);
  });
});
