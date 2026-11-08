/**
 * The promise collections' content (hspromise M1-M3): Selah's fourteen
 * collections as references only, each promise read through the app's own
 * corpus (`versesOf`). Its seams: `COLLECTIONS` and `TAUGHT`, judged by
 * the corpus the app reads and the matcher's word count, never by Selah's
 * Swift file (the acceptance check holds the parity with it).
 *
 * It catches a promise dropped or added, a range past its chapter or one
 * verse too long or short, a book name the canon lacks, a verse with no
 * text, a promise listed twice, a collection out of its size, an id twice,
 * a title changed, a promise too long to say at once, and a taught set
 * other than the Fear collection. It misses a promise moved to another
 * reference of the same shape in the same chapter, which only the parity
 * with Selah's list sees.
 */

import { describe, expect, it } from 'bun:test';

import { versesOf } from '../kjv';
import { sourceWords } from '../matcher/words';
import { COLLECTIONS, TAUGHT } from '../promises';
import { spanRef } from '../test/passages-model';

/** Every promise with its collection's id, in the list's order. */
const PROMISES = COLLECTIONS.flatMap((collection) =>
  collection.promises.map((range) => ({ id: collection.id, range, reference: spanRef(range) })),
);

/** The verses' texts a promise names, as the corpus holds them: one for each verse of its range the chapter has. */
const textsOf = (range: (typeof PROMISES)[number]['range']) =>
  versesOf(range.book, range.chapter).slice(range.first - 1, range.last);

/** The longest promise a reader is asked to say at once, in words as the matcher counts them (Selah's rule). */
const MOST_WORDS = 70;

describe('the promise collections', () => {
  it('are Selah’s fourteen, in its order, with its titles', () => {
    expect(COLLECTIONS.map((collection) => [collection.id, collection.title])).toEqual([
      ['forgiveness', 'Forgiveness'],
      ['peace', 'Peace in Anxiety'],
      ['strength', 'Strength'],
      ['provision', 'Provision'],
      ['guidance', 'Guidance & Wisdom'],
      ['protection', 'Protection & Fear'],
      ['victory', 'Temptation & Victory'],
      ['spirit', 'The Holy Spirit'],
      ['healing', 'Healing'],
      ['comfort', 'Comfort in Grief'],
      ['salvation', 'Salvation & Assurance'],
      ['return', 'Christ\u2019s Return'],
      ['prayer', 'Prayer Answered'],
      ['rest', 'Rest'],
    ]);
  });

  it('hold 10 to 12 promises each, 158 in all over 188 verses', () => {
    const sizes = COLLECTIONS.map((collection) => collection.promises.length);
    const verses = PROMISES.reduce(
      (sum, { range }) => sum + Math.max(0, range.last - range.first + 1),
      0,
    );
    expect({
      outOfSize: COLLECTIONS.filter(
        (_, index) => (sizes[index] ?? 0) < 10 || (sizes[index] ?? 0) > 12,
      ).map((collection) => collection.id),
      promises: PROMISES.length,
      verses,
    }).toEqual({ outOfSize: [], promises: 158, verses: 188 });
  });

  it('resolve each to 1-3 verses of its chapter, each with text, the whole at most 70 words', () => {
    const wrong = PROMISES.flatMap(({ range, reference }) => {
      const count = range.last - range.first + 1;
      const texts = textsOf(range);
      const words = texts.reduce((sum, text) => sum + sourceWords(text).length, 0);
      const faults: readonly (readonly [boolean, string])[] = [
        [count < 1 || count > 3, `${count} verses`],
        [range.first < 1 || texts.length !== count, `${texts.length} of its verses in the KJV`],
        [texts.some((text) => text.trim() === ''), 'a verse with no text'],
        [words > MOST_WORDS, `${words} words`],
      ];
      return faults.filter(([fault]) => fault).map(([, what]) => `${reference}: ${what}`);
    });
    expect(wrong).toEqual([]);
  });

  it('name no promise twice, and no id twice', () => {
    const twice = (names: readonly string[]) =>
      names.filter((name, index) => names.indexOf(name) !== index);
    expect({
      promises: twice(PROMISES.map(({ reference }) => reference)),
      ids: twice(COLLECTIONS.map((collection) => collection.id)),
    }).toEqual({ promises: [], ids: [] });
  });

  it('teach the Fear collection alone: 12 promises over 14 verses', () => {
    const taught = COLLECTIONS.filter((collection) => TAUGHT.includes(collection.id));
    expect({
      taught: [...TAUGHT],
      known: TAUGHT.every((id) => COLLECTIONS.some((collection) => collection.id === id)),
      promises: taught.map((collection) => collection.promises.length),
      verses: taught.map((collection) =>
        collection.promises.reduce((sum, range) => sum + textsOf(range).length, 0),
      ),
    }).toEqual({ taught: ['protection'], known: true, promises: [12], verses: [14] });
  });
});
