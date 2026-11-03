/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals -- the test reads the app's package.json, turbo.json and test files from disk, synchronously, and parses the two JSON files plainly. */

import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const APP = join(import.meta.dir, '..');
const PRELOAD = './src/test/setup.ts';
const ROOTS = ['src', 'infra', 'scripts', 'vite'] as const;

const TEST_NAME = /(?:\.test|_test|\.spec|_spec)\.[cm]?[jt]sx?$/;
const UNIT_NAME = /\.test\.tsx?$/;
const SLOW_NAME = /\.slow\.test\./;

const testsUnder = (folder: string): ReadonlyArray<string> =>
  readdirSync(join(APP, folder), { withFileTypes: true }).flatMap((entry) => {
    const path = `${folder}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) return [];
      return testsUnder(path);
    }
    if (TEST_NAME.test(entry.name)) return [path];
    return [];
  });

interface Part {
  readonly preloads: ReadonlyArray<string>;
  readonly paths: ReadonlyArray<string>;
  readonly ignoredNames: ReadonlyArray<string>;
  readonly ignoredPaths: ReadonlyArray<string>;
}

type Word =
  | { readonly _tag: 'Flag' }
  | { readonly _tag: 'Preload'; readonly file: string }
  | { readonly _tag: 'IgnoredName'; readonly name: string }
  | { readonly _tag: 'IgnoredPath'; readonly path: string }
  | { readonly _tag: 'Path'; readonly path: string }
  | { readonly _tag: 'Refused'; readonly word: string };

type Read =
  | { readonly _tag: 'Part'; readonly part: Part }
  | { readonly _tag: 'Refused'; readonly reason: string };

const unquote = (word: string) => word.replace(/^'(.*)'$/, '$1');

const readIgnored = (word: string, pattern: string): Word => {
  const name = /^\*\*\/\*([^*/]+)\*$/.exec(pattern)?.[1];
  if (name) return { _tag: 'IgnoredName', name };
  if (/^[\w./-]+$/.test(pattern) && !pattern.startsWith('.'))
    return { _tag: 'IgnoredPath', path: pattern };
  return { _tag: 'Refused', word };
};

const readWord = (word: string): Word => {
  if (word === '--no-isolate' || /^--parallel=\d$/.test(word)) return { _tag: 'Flag' };
  const preload = /^--preload=(\.\/[\w./-]+)$/.exec(word)?.[1];
  if (preload && !preload.includes('..')) return { _tag: 'Preload', file: preload };
  const ignored = /^--path-ignore-patterns=(.+)$/.exec(word)?.[1];
  if (ignored) return readIgnored(word, unquote(ignored));
  if (/^\.\/[\w./-]+$/.test(word) && !word.includes('..'))
    return { _tag: 'Path', path: word.slice(2) };
  return { _tag: 'Refused', word };
};

const tagged = <Tag extends Word['_tag']>(words: ReadonlyArray<Word>, tag: Tag) =>
  words.filter((word): word is Extract<Word, { readonly _tag: Tag }> => word._tag === tag);

const readPart = (command: string): Read => {
  const [bun, test, ...rest] = command
    .trim()
    .replace(/--preload\s+/g, '--preload=')
    .split(/\s+/);
  if (bun !== 'bun' || test !== 'test')
    return { _tag: 'Refused', reason: `not a bun test: ${command}` };
  const words = rest.map(readWord);
  const refused = tagged(words, 'Refused').map((word) => word.word);
  if (refused.length > 0)
    return { _tag: 'Refused', reason: `words the grammar does not read: ${refused.join(' ')}` };
  const preloads = tagged(words, 'Preload').map((word) => word.file);
  if (preloads.length > 1)
    return { _tag: 'Refused', reason: `two preloads: ${preloads.join(' ')}` };
  return {
    _tag: 'Part',
    part: {
      preloads,
      paths: tagged(words, 'Path').map((word) => word.path),
      ignoredNames: tagged(words, 'IgnoredName').map((word) => word.name),
      ignoredPaths: tagged(words, 'IgnoredPath').map((word) => word.path),
    },
  };
};

const takenBy = (part: Part): ReadonlyArray<string> =>
  part.paths
    .flatMap((path) => {
      if (statSync(join(APP, path)).isDirectory()) return testsUnder(path);
      return [path];
    })
    .filter((file) => {
      const name = file.slice(file.lastIndexOf('/') + 1);
      if (part.ignoredNames.some((held) => name.includes(held))) return false;
      return !part.ignoredPaths.some((path) => file === path || file.startsWith(`${path}/`));
    });

const scripts: Record<string, string> = JSON.parse(
  readFileSync(join(APP, 'package.json'), 'utf8'),
).scripts;
const turbo = JSON.parse(readFileSync(join(APP, 'turbo.json'), 'utf8'));
const partNames: ReadonlyArray<string> = (
  turbo.tasks.test.dependsOn as ReadonlyArray<string>
).filter((task) => task.startsWith('test:'));
const reads = partNames.map((name) => ({ name, read: readPart(scripts[name] || '') }));
const parts = reads.flatMap(({ name, read }) => {
  if (read._tag === 'Refused') return [];
  return [{ name, part: read.part }];
});
const refusals = reads.flatMap(({ name, read }) => {
  if (read._tag === 'Part') return [];
  return [`${name}: ${read.reason}`];
});
const taken = parts.flatMap(({ name, part }) =>
  takenBy(part).map((file) => ({ name, part, file })),
);

const units = ROOTS.flatMap((root) => testsUnder(root)).filter(
  (file) => UNIT_NAME.test(file) && !SLOW_NAME.test(file),
);

describe('the unit-test parts', () => {
  it('are the test:<part> scripts the commandless test depends on, each a script', () => {
    expect(turbo.tasks.test.dependsOn[0]).toBe('$TURBO_EXTENDS$');
    expect(Object.hasOwn(scripts, 'test')).toBe(false);
    expect(partNames.length).toBeGreaterThan(1);
    expect(partNames.filter((name) => !Object.hasOwn(scripts, name))).toEqual([]);
  });

  it('each read in the grammar', () => {
    expect(refusals).toEqual([]);
  });

  it('take every unit-test file, each in exactly one part', () => {
    expect(units.length).toBeGreaterThanOrEqual(112);
    const counts = new Map<string, ReadonlyArray<string>>();
    for (const { name, file } of taken) counts.set(file, [...(counts.get(file) || []), name]);
    expect({
      untaken: units.filter((file) => !counts.has(file)),
      twice: [...counts].filter(([, names]) => names.length > 1),
    }).toEqual({ untaken: [], twice: [] });
  });

  it('take no slow file and no file outside the unit-test set', () => {
    const set = new Set(units);
    expect(
      taken.filter(({ file }) => !set.has(file)).map(({ name, file }) => `${name}: ${file}`),
    ).toEqual([]);
  });

  it('each ignore every slow file, and name none', () => {
    expect({
      unignored: parts
        .filter(({ part }) => !part.ignoredNames.includes('.slow.test.'))
        .map(({ name }) => name),
      named: parts.flatMap(({ name, part }) =>
        part.paths.filter((path) => SLOW_NAME.test(path)).map((path) => `${name}: ${path}`),
      ),
    }).toEqual({ unignored: [], named: [] });
  });

  it('run every src file under the test preload, and every infra, scripts and vite file under none', () => {
    const wrong = taken.filter(({ part, file }) => {
      if (file.startsWith('src/')) return part.preloads.join(' ') !== PRELOAD;
      return part.preloads.length > 0;
    });
    expect(wrong.map(({ name, file }) => `${name}: ${file}`)).toEqual([]);
  });

  it('refuse each command outside the grammar', () => {
    const refused = [
      'bun test ./src && bun test ./infra',
      'bun test src',
      "bun test --path-ignore-patterns='src/**/*.test.ts' ./src",
      'bun test --timeout 5000 ./src',
      'bun test ./src/../infra',
      'BUN_OPTIONS=x bun test ./src',
      'bun test --preload ./src/test/setup.ts --preload ./src/test/other.ts ./src',
    ];
    expect(refused.filter((command) => readPart(command)._tag === 'Part')).toEqual([]);
  });
});
