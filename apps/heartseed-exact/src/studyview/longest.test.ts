/* oxlint-disable effect/noTernary -- Exact's app folder cannot import effect (docs/exact.md): a test over plain records read from the assets. */

/**
 * The longest things the sheet shows, found here in the assets `bible.db`
 * is built from, never named: the longest definition folds and opens
 * whole; the entry the KJV renders most ways shows six renderings; the
 * verse with the most words, and Psalm 119's longest, have a button per
 * tagged word and a word per shown word. No text is written or printed:
 * the checks read lengths and counts.
 */

import { expect, it } from 'bun:test';

import { assetLexicon, assetWords } from '../../tools/study';
import { buildLexicon, buildTags, type Tally } from '../study/build';
import { chapterIndex } from '../study/canon';
import { studyPackOf } from '../study/pack';
import { entryRead, wordsRead } from '../study/read';
import { renderOf } from '../study/words';
import { appSource } from '../test/study-assets';
import { DEF_LINES, entryShown, FOLD_DEF, RENDERS, sheetOf } from './sheet';

const source = appSource();
const words = assetWords();
const lexicon = assetLexicon();

/** Each number's carriers, counted from the asset's tagged words. */
const tally: Tally = { totals: new Map(), words: new Map() };
for (const [key, verse] of words) {
  const letter = Number(key.split('.')[0]) <= 39 ? 'H' : 'G';
  for (const word of verse)
    for (const n of word.numbers) {
      const number = `${letter}${n}`;
      tally.totals.set(number, (tally.totals.get(number) ?? 0) + 1);
      const counts = tally.words.get(number) ?? new Map<string, number>();
      tally.words.set(number, counts);
      const shown = renderOf(word.text);
      if (shown !== '') counts.set(shown, (counts.get(shown) ?? 0) + 1);
    }
}
const lexiconPack = studyPackOf(buildLexicon(lexicon, tally));

it('folds the longest definition and opens it whole', () => {
  const longest = lexicon.reduce((a, b) => (b.def.length > a.def.length ? b : a));
  const shown = entryShown(entryRead(lexiconPack, longest.number), 'k', 'waiting');
  expect(longest.def.length).toBeGreaterThan(FOLD_DEF);
  expect(shown.folds).toBe(true);
  expect(shown.def.length).toBe(longest.def.length);
  expect(DEF_LINES).toBe(5);
});

it('shows six renderings for the entry the KJV renders most ways', () => {
  const most = [...tally.words].reduce((a, b) => (b[1].size > a[1].size ? b : a));
  expect(most[1].size).toBeGreaterThan(RENDERS);
  const shown = entryShown(entryRead(lexiconPack, most[0]), 'k', 'waiting');
  expect(shown.renders.length).toBe(RENDERS);
  expect(shown.rendersLine).toBe(`In the KJV, ${tally.totals.get(most[0])} times, as`);
});

/** The verse of `chapters` with the most shown words: its place and its word count. */
const mostWords = (indexes: ReadonlyArray<number>) => {
  let best = { index: 0, verse: 0, count: 0 };
  for (const index of indexes)
    (source.chapters[index] ?? '').split('\n').forEach((text, at) => {
      const count = text.split(' ').length;
      if (count > best.count) best = { index, verse: at + 1, count };
    });
  return best;
};

it('gives the verse with the most words, and Psalm 119’s longest, a button per tagged word', () => {
  const psalm = chapterIndex(19, 119);
  for (const found of [mostWords(source.canon.map((_, index) => index)), mostWords([psalm])]) {
    const [book = 0, chapter = 0] = source.canon[found.index] ?? [];
    const parts = Array.from({ length: source.canon.length }, () => '');
    parts[found.index] =
      buildTags({ ...source, words: (key) => words.get(key) }, found.index, found.index + 1)
        .parts[0] ?? '';
    const read = wordsRead(studyPackOf(parts), book, chapter, found.verse);
    const sheet = sheetOf({
      book,
      chapter,
      verse: found.verse,
      reference: 'R',
      language: 'Hebrew',
      xrefs: { have: true, refs: [] },
      words: read,
      notes: { have: true, verses: [] },
      held: true,
      waiting: { xrefs: '', tags: '', commentary: '', lexicon: '' },
    });
    const tagged = read.words.filter((word) => word.numbers.length > 0).length;
    expect(sheet.words.length).toBe(found.count);
    expect(tagged).toBeGreaterThan(0);
    expect(sheet.words.filter((word) => word.tagged).length).toBe(tagged);
    expect(new Set(sheet.words.filter((word) => word.tagged).map((word) => word.name)).size).toBe(
      tagged,
    );
  }
});
