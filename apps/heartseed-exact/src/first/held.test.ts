/* oxlint-disable effect/noNodeBuiltinImport, effect/noTernary -- a text test: it reads the port's own sources from disk, and finds each fault by a plain branch. */

/**
 * The first verse has one holder, the current Heartseed's
 * `vite/first-verse.ts` (handed on by `@manna/heartseed/first/verse`): no
 * source of the port (Bun tests aside), no feature, `app.contract`,
 * `app.ts` nor test contract names its book beside its chapter and verse,
 * or holds any three-word run of its words, comments included. A test
 * contract cannot compare two reads, so it asserts the reference is drawn;
 * `tools/drive-first.ts` reads it from the app's own data and compares.
 *
 * And the model test's mirror of features/first.contract holds to the file:
 * the first minute's keep (`gardenKeepFirst`) is sent only by the action
 * `firstKeep`, which only the alone arm's task `firstKept` runs, and no
 * other feature sends it.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { expect, it } from 'bun:test';
import { versesOf } from '@manna/heartseed/kjv';

import { firstPlace, firstReference } from './verse';

const APP = join(import.meta.dir, '..', '..');

/** Every file under `dir`, by its path. */
const filesUnder = (dir: string): readonly string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesUnder(path);
    return [path];
  });

const isTest = (path: string) =>
  path.includes('.test.') || path.includes(`${join('src', 'test')}/`);

const HOLDERS = [
  ...filesUnder(join(APP, 'src')).filter((path) => !isTest(path) && /\.(ts|tsx|js)$/u.test(path)),
  ...filesUnder(join(APP, 'features')),
  join(APP, 'app.contract'),
  join(APP, 'app.ts'),
  ...readdirSync(APP)
    .filter((name) => name.endsWith('.test.contract'))
    .map((name) => join(APP, name)),
];

const PLACE = firstPlace();

it('the first verse names a place', () => {
  expect(PLACE._tag).toBe('Some');
});

it("no source of the port holds the first verse's reference or a run of its words", () => {
  if (PLACE._tag !== 'Some') return;
  const { book, chapter, verse } = PLACE.value;
  const name = firstReference().slice(0, firstReference().lastIndexOf(' '));
  expect(name.length).toBeGreaterThan(0);
  const reference = new RegExp(`${name}\\W+${chapter}\\W+${verse}\\b`, 'iu');
  const words = (versesOf(book, chapter)[verse - 1] ?? '').split(/\s+/u);
  const runs = words.slice(0, -2).map((_, at) => words.slice(at, at + 3).join(' '));
  expect(runs.length).toBeGreaterThan(5);
  const found = HOLDERS.flatMap((path) => {
    const text = readFileSync(path, 'utf8');
    const named = reference.test(text) ? [`${path}: reference`] : [];
    return [...named, ...runs.filter((run) => text.includes(run)).map((run) => `${path}: ${run}`)];
  });
  expect(found).toEqual([]);
});

it("only the alone arm's task sends the first minute's keep", () => {
  const first = readFileSync(join(APP, 'features', 'first.contract'), 'utf8').split('\n');
  const senders = first.flatMap((line, at) => (line.includes('gardenKeepFirst(') ? [at] : []));
  expect(senders.length).toBeGreaterThan(0);
  const actionOf = (at: number) =>
    first
      .slice(0, at)
      .findLast((line) => /^ {2}(action|task|derive|state|resource|mutation) /u.test(line)) ?? '';
  expect([...new Set(senders.map(actionOf))]).toEqual(['  action firstKeep']);
  const runs = first.filter(
    (line) => line.includes('firstKeep') && !line.includes('action firstKeep'),
  );
  expect(runs.map((line) => line.trim())).toEqual(['change(firstKeep)']);
  const task = first.findIndex((line) => line.trim() === 'change(firstKeep)');
  expect(first[task - 1]?.trim().startsWith('task firstKept when first.phase == "alone"')).toBe(
    true,
  );
  const others = filesUnder(join(APP, 'features')).filter(
    (path) =>
      !path.endsWith('first.contract') && readFileSync(path, 'utf8').includes('gardenKeepFirst'),
  );
  expect([
    ...others,
    readFileSync(join(APP, 'app.contract'), 'utf8').includes('gardenKeepFirst'),
  ]).toEqual([false]);
});
