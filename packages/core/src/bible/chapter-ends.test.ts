import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';

import { BIBLE_BOOKS } from './canon.js';
import { kjvChapterEnds } from './chapter-ends.js';

const endsOf = (book: number, chapters: number): Option.Option<number>[] =>
  Array.from({ length: chapters }, (_, at) => kjvChapterEnds(book, at + 1));

describe("the KJV's chapter ends", () => {
  test("every book's chapters end, and the canon's 31,102 verses are theirs", () => {
    let verses = 0;
    for (const book of BIBLE_BOOKS) {
      const ends = endsOf(book.number, book.chapters);
      expect([book.name, ends.every(Option.isSome)]).toEqual([book.name, true]);
      verses += ends.reduce((sum, end) => sum + Option.getOrElse(end, () => 0), 0);
      expect(kjvChapterEnds(book.number, book.chapters + 1)).toEqual(Option.none());
    }
    expect(verses).toBe(31_102);
  });

  test('a chapter or book the canon lacks has no end', () => {
    expect(kjvChapterEnds(19, 119)).toEqual(Option.some(176));
    expect(kjvChapterEnds(43, 11)).toEqual(Option.some(57));
    expect(kjvChapterEnds(1, 0)).toEqual(Option.none());
    expect(kjvChapterEnds(0, 1)).toEqual(Option.none());
    expect(kjvChapterEnds(67, 1)).toEqual(Option.none());
  });
});
