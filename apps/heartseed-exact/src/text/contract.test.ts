/* oxlint-disable effect/noGlobals, effect/noTernary, effect/noNodeBuiltinImport -- Exact's app folder cannot import effect (docs/exact.md): the test reads two Contract files as text, and picks a field's oracle by a plain branch. */

/**
 * `text.test.contract` holds the words the built app reads to the current
 * Heartseed's without a verse's text in the repo: each `textSum` resource
 * of `features/text.contract` names a range, and each length and sum the
 * contract test expects of it is the one the current app's deriver gives
 * that verse (`@manna/heartseed/vite/kjv`, split as `versesOf` splits it).
 * It catches a literal that drifted from the corpus, or a probe whose range
 * changed under its test. The probe draws nothing, so a plain launch has no
 * probe node.
 */

import { readFileSync } from 'node:fs';

import { readVerses } from '@manna/heartseed/passage';
import { readChapters } from '@manna/heartseed/vite/kjv';
import { expect, it } from 'bun:test';

import { sumOf } from './sum';

const read = (name: string) => readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8');

/** Each chapter's index in the corpus, by `book:chapter`. */
const INDEX = new Map<string, number>();
for (const row of readVerses()) {
  const key = `${row.book}:${row.chapter}`;
  if (!INDEX.has(key)) INDEX.set(key, INDEX.size);
}
const CHAPTERS = readChapters();

/** Each `textSum` probe of the feature, by its resource's name: book, chapter and first verse. */
const PROBES = new Map(
  [
    ...read('features/text.contract').matchAll(
      /resource (\w+) = textSum\((\d+), (\d+), (\d+), \d+\)/gu,
    ),
  ].map(([, name = '', book, chapter, first]) => [
    name,
    { book: Number(book), chapter: Number(chapter), first: Number(first) },
  ]),
);

/** Each length and sum the contract test expects: resource, verse index, field, value. */
const EXPECTED = [
  ...read('text.test.contract').matchAll(
    /expect state (\w+)\.verses\.(\d+)\.(length|sum) == (\d+)/gu,
  ),
].map(([, name = '', at, field, value]) => ({
  name,
  at: Number(at),
  field,
  value: Number(value),
}));

it('expects of each probe the length and sum of the current app’s verse', () => {
  expect(PROBES.size).toBe(3);
  expect(new Set(EXPECTED.map(({ name }) => name))).toEqual(new Set(PROBES.keys()));
  expect(EXPECTED.length).toBe(PROBES.size * 2);
  for (const { name, at, field, value } of EXPECTED) {
    const probe = PROBES.get(name);
    const chapter = CHAPTERS[INDEX.get(`${probe?.book}:${probe?.chapter}`) ?? -1] ?? '';
    const verse = chapter.split('\n')[(probe?.first ?? 0) - 1 + at] ?? '';
    expect(verse.length, name).toBeGreaterThan(0);
    expect(value, `${name} ${field}`).toBe(field === 'sum' ? sumOf(verse) : verse.length);
  }
});

it('draws no probe: the feature has no view', () => {
  expect(read('features/text.contract')).not.toMatch(/^\s*(view|component)\b/mu);
  expect(read('text.test.contract')).toContain('expect tree missing "text-probe"');
});
