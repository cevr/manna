/* oxlint-disable effect/noNodeBuiltinImport -- the test reads the app's sources from disk, synchronously, as a copy of the census holds them. */

/**
 * The census's cases stay live without a build: each case's words are in
 * its file exactly once, as the census needs to put its own words there,
 * and a case that writes a new file names one the app does not hold. A
 * case on a built file reads the text the build writes there. So a change
 * to the app's words that strands a case is red in the gate, not first in
 * `test:slow`'s census.
 */
import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { llmsTxt } from '../src/meta.ts';
import { PAGES } from '../src/pages.ts';
import { type Case, CASES } from './promise-cases.ts';

const APP = join(import.meta.dir, '..');

/** Each built file a case reads, by the text the build writes there. */
const BUILT = new Map([['dist/llms.txt', llmsTxt(PAGES)]]);

/** What `file` holds for the census: the built text for a built file, else the app's file, if it is there. */
const textOf = (file: string): Option.Option<string> => {
  if (file.startsWith('dist/')) return Option.fromNullishOr(BUILT.get(file));
  const path = join(APP, file);
  if (!existsSync(path)) return Option.none();
  return Option.some(readFileSync(path, 'utf8'));
};

/** What strands `found`: its words not in its file once, or its new file there already. */
const strands = (found: Case): ReadonlyArray<string> => {
  const text = textOf(found.file);
  if (found.find === '') {
    if (Option.isNone(text)) return [];
    return [`${found.name}: ${found.file} is there already`];
  }
  const times = Option.match(text, {
    onNone: () => 0,
    onSome: (held) => held.split(found.find).length - 1,
  });
  if (times === 1) return [];
  return [`${found.name}: ${found.file} holds its words ${times} times`];
};

describe('the promise census', () => {
  test("finds each case's words in its file exactly once, and each new file not there yet", () => {
    expect(CASES.length).toBeGreaterThan(0);
    expect(CASES.flatMap(strands)).toEqual([]);
  });

  test('names each case once', () => {
    const names = CASES.map(({ name }) => name);
    expect(names.filter((name, at) => names.indexOf(name) !== at)).toEqual([]);
  });
});
