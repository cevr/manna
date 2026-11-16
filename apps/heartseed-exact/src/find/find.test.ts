/* oxlint-disable effect/noAsyncFunction, effect/noNewPromise, effect/noNullish, eslint/no-await-in-loop -- Exact's app folder cannot import effect (docs/exact.md): the test awaits the data source's promise, given packs as resolved promises, one source after the other. */

/**
 * Find's answers that need no model: an empty query or one of marks alone
 * answers nothing, a reference answers `parseBibleQuery`'s place first, a
 * place the canon lacks answers none, a word the Bible lacks says the
 * line, and a hit's cut stays within its bounds at word edges. With no
 * word index downloaded, a reference still answers and words say so.
 */

import { expect, it } from 'bun:test';
import { withDataHost } from '@manna/exact-kit/data-host/testing';
import { parseBibleQuery } from '@manna/core/bible';

import { findPack } from '../../tools/find';
import { CUT_ALL, CUT_BEFORE, cutOf, DOWNLOADING_LINE, findWith, NOTHING_LINE } from './find';
import { findIndexOf } from './index';
import { findSources, packAt } from './sources';

const LIMIT = 50;
const find = findWith(findIndexOf(findPack()));
const ask = (query: string) => withDataHost(() => find(query, LIMIT));

it('answers nothing to an empty query or one of marks and numbers alone', () => {
  for (const query of ['', ' ', '...', ', ; !', '316', '12:4'])
    expect(ask(query)).toEqual({ query, places: [], hits: [], more: 0, line: '' });
});

it("answers a reference's place first, as parseBibleQuery reads it", () => {
  for (const query of ['john 3:16', 'ps 23', '1 cor 13:1-5', 'ruth', 'Genesis 1', 'john 3-5']) {
    const parsed = parseBibleQuery(query);
    const place = ask(query).places[0];
    const { book, chapter, verse } = place ?? { book: 0, chapter: 0, verse: -1 };
    const got = { book, chapter, verse };
    if (parsed._tag === 'single')
      expect(got).toEqual({
        book: parsed.ref.book,
        chapter: parsed.ref.chapter,
        verse: parsed.ref.verse,
      });
    else if (parsed._tag === 'chapter')
      expect(got).toEqual({ book: parsed.ref.book, chapter: parsed.ref.chapter, verse: 0 });
    else if (parsed._tag === 'fullBook')
      expect(got).toEqual({ book: parsed.ref.book, chapter: 1, verse: 0 });
    else if (parsed._tag === 'verseRange') {
      const { start } = parsed.ref;
      expect(got).toEqual({ book: start.book, chapter: start.chapter, verse: start.verse });
    } else if (parsed._tag === 'chapterRange')
      expect(got).toEqual({ book: parsed.start.book, chapter: parsed.start.chapter, verse: 0 });
    else expect(parsed._tag).not.toBe('search');
  }
  expect(ask('john 3:99').places).toEqual([]);
});

it('says the line when no verse and no place answers', () => {
  const shown = ask('zzqx');
  expect(shown).toMatchObject({ places: [], hits: [], more: 0, line: NOTHING_LINE });
  expect(ask('ruth').line).toBe('');
});

it('with no word index, answers a reference, says words are downloading, and answers an empty query nothing', async () => {
  for (const sources of [findSources(packAt('')), findSources(() => Promise.resolve(undefined))]) {
    const john = await sources.findRead(['john 3:16', LIMIT]);
    expect(john.places.map((place) => place.label)).toEqual(['John 3:16']);
    expect(john.line).toBe(DOWNLOADING_LINE);
    expect(await sources.findRead(['fear not', LIMIT])).toEqual({
      query: 'fear not',
      places: [],
      hits: [],
      more: 0,
      line: DOWNLOADING_LINE,
    });
    expect((await sources.findRead(['', LIMIT])).line).toBe('');
  }
  const pack = findPack();
  const served = findSources(() => Promise.resolve(pack));
  expect(await served.findRead(['fear not', LIMIT])).toEqual(find('fear not', LIMIT));
  expect(
    (await findSources(() => Promise.resolve({ ...pack, format: 0 })).findRead(['fear not', LIMIT]))
      .line,
  ).toBe(DOWNLOADING_LINE);
});

it('cuts a long text at word edges around its match', () => {
  const words = Array.from({ length: 60 }, (_, at) => `w${at}`);
  const text = words.join(' ');
  const start = text.indexOf('w30');
  const cut = cutOf(text, start, start + 3);
  expect(cut.match).toBe('w30');
  expect(cut.before.length).toBeLessThanOrEqual(CUT_BEFORE);
  expect((cut.before + cut.match + cut.after).length).toBeLessThanOrEqual(CUT_ALL);
  expect(text.includes(cut.before + cut.match + cut.after)).toBe(true);
  expect(cut.before.startsWith('w')).toBe(true);
  expect(cut.after.endsWith(' ')).toBe(false);
  expect(cutOf('short one', 0, 5)).toEqual({ before: '', match: 'short', after: ' one' });
});
