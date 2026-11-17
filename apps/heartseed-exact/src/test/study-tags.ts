/* oxlint-disable effect/noNullish, effect/noGlobals, effect/noTernary -- Exact's app folder cannot import effect (docs/exact.md): a test body over plain records, its counts printed for the request. */

/**
 * The tags pack against `kjv-strongs.json` over a run of the canon's
 * chapters (each test part takes one, so the asset is parsed once per
 * part): every verse has one token per shown word; a verse equal in word
 * count carries the asset's numbers word for word; at least 99% of the
 * asset's numbered words keep their numbers; under 0.5% of verses are bare.
 */

import { describe, expect, it } from 'bun:test';

import { assetWords } from '../../tools/study';
import { buildTags } from '../study/build';
import { studyPackOf } from '../study/pack';
import { wordsRead } from '../study/read';
import { letterOf } from '../study/tags';
import { appSource } from './study-assets';

/** The checks over chapters `from` to `to` (indexes, `to` excluded), named `name`, the aligned and bare verses held under `ceiling` (the counts measured when it was written). */
export const tagsChecks = (
  name: string,
  from: number,
  to: number,
  ceiling: { readonly aligned: number; readonly bare: number },
) => {
  const source = appSource();
  const asset = assetWords();
  const built = buildTags({ ...source, words: (key) => asset.get(key) }, from, to);
  const parts = Array.from({ length: source.canon.length }, (_, index) =>
    index >= from && index < to ? (built.parts[index - from] ?? '') : '',
  );
  const pack = studyPackOf(parts);

  describe(`the tags pack, ${name}, against kjv-strongs.json`, () => {
    /** A verse's faults: `count` when a tagged verse's tokens are not one per shown word, `numbers` when an equal verse's are not the asset's. */
    const faultsOf = (index: number, verse: number, tokens: string): Array<string> => {
      const [book, chapter] = source.canon[index] ?? [0, 0];
      const words = wordsRead(pack, book, chapter, verse).words;
      const tagged = asset.get(`${book}.${chapter}.${verse}`);
      if (tagged === undefined) return [];
      const faults: Array<string> = [];
      if (tokens !== '' && tokens.split(' ').length !== words.length) faults.push('count');
      if (tagged.length !== words.length) return faults;
      const letter = letterOf(book);
      const same = tagged.every(
        (word, at) =>
          (words[at]?.numbers ?? []).join('+') ===
            word.numbers.map((n) => `${letter}${n}`).join('+') && words[at]?.added === word.added,
      );
      if (!same) faults.push('numbers');
      return faults;
    };

    it("every tagged verse has one token per shown word, and an equal verse the asset's numbers word for word", () => {
      const wrong: Array<string> = [];
      for (let index = from; index < to; index++) {
        const [book, chapter] = source.canon[index] ?? [0, 0];
        const verses = (source.chapters[index] ?? '').split('\n').length;
        const chapterTokens = (pack.parts[index] ?? '').split('|');
        for (let verse = 1; verse <= verses; verse++)
          for (const fault of faultsOf(index, verse, chapterTokens[verse - 1] ?? ''))
            wrong.push(`${book}.${chapter}.${verse} ${fault}`);
      }
      expect(wrong).toEqual([]);
    });

    it("at least 99% of the asset's numbered words keep their numbers, and under 0.5% of verses are bare", () => {
      const { equal, aligned, bare, numbered, kept, bareVerses } = built.counts;
      process.stdout.write(
        `study tags ${name}: equal ${equal} aligned ${aligned} bare ${bare} kept ${kept}/${numbered}${bareVerses.length > 0 ? ` bare at ${bareVerses.join(' ')}` : ''}\n`,
      );
      expect(kept / numbered).toBeGreaterThanOrEqual(0.99);
      expect(bare / (equal + aligned + bare)).toBeLessThan(0.005);
      expect(aligned).toBeLessThanOrEqual(ceiling.aligned);
      expect(bare).toBeLessThanOrEqual(ceiling.bare);
    });
  });
};
