/* oxlint-disable effect/noGlobals, effect/noTernary -- the property names a wrong range by its JSON, and writes expected values as plain branches. */

/**
 * The range rule and the references (hskjv P1, P2), over every chapter of
 * all 66 books. Its seams: `inChapter` and `choosable`, judged against the
 * model's `fits` and `addable` (`test/passages-model.ts`, over the model's
 * own corpus), and `verseReference` and `passageReference` against the
 * model's references, the books named by the canon.
 *
 * It catches a cap other than 20 or one counted off by one, a whole short
 * chapter refused, a range past its chapter, reversed, at verse 0, in
 * chapter 0, past its book or outside the canon taken, a fraction taken for
 * a whole number, and a reference written another way (a range's book
 * repeated, a one-verse range written as a range). It misses nothing the
 * service adds on top: the caps' order is the service test's.
 */

import { describe, expect, it } from 'bun:test';

import { readVerses } from '../../vite/passage';
import { choosable, inChapter, passageReference, verseReference } from '../passages';
import { below, random } from '../test/garden-model';
import {
  addable,
  corpusOf,
  fits,
  NAMES,
  spanRef,
  versesIn,
  verseRef,
  type Span,
} from '../test/passages-model';

const CORPUS = corpusOf(readVerses());

/** Each kind of range a generator makes in a chapter of `count` verses, from `next`. */
const kindsIn = (next: () => number, book: number, chapter: number, count: number) => {
  const from = (length: number) => 1 + below(next, Math.max(1, count - length + 1));
  const span = (first: number, last: number): Span => ({ book, chapter, first, last });
  const run = (length: number) => {
    const first = from(length);
    return span(first, first + length - 1);
  };
  const one = 1 + below(next, count);
  return [
    ['one verse', span(one, one)],
    ['2-19 verses', run(2 + below(next, 18))],
    ['20 verses', run(20)],
    ['21 verses', run(21)],
    ['40 verses', run(40)],
    ['the whole chapter', span(1, count)],
    ['reversed', span(Math.min(count, one + 1), Math.max(1, one))],
    ['reversed by one', span(2, 1)],
    ['from verse 0', span(0, Math.min(count, 3))],
    ['past the chapter', span(Math.max(1, count - 1), count + 1)],
    ['a fraction first', span(1.5, Math.min(count, 3))],
    ['a fraction last', span(1, 1.5)],
    ['a fraction chapter', { book, chapter: chapter + 0.5, first: 1, last: 1 }],
    ['a fraction book', { book: book + 0.5, chapter, first: 1, last: 1 }],
    ['chapter 0', { book, chapter: 0, first: 1, last: 1 }],
    ['past the book', { book, chapter: (CORPUS.counts.get(book) ?? 0) + 1, first: 1, last: 1 }],
  ] as const;
};

describe('the range rule, over every chapter of the canon', () => {
  it('takes a range in one chapter, and lets a reader add one of at most 20 verses, as the rule does', () => {
    const next = random(41_10);
    const ranges = CORPUS.books.flatMap((book) =>
      Array.from({ length: CORPUS.counts.get(book) ?? 0 }, (_, index) =>
        kindsIn(next, book, index + 1, versesIn(CORPUS, book, index + 1).length),
      ).flat(),
    );
    const outside = [0, 67, -1].map(
      (book) => ['outside the canon', { book, chapter: 1, first: 1, last: 1 }] as const,
    );
    const wrong = [...ranges, ...outside]
      .filter(
        ([, span]) =>
          inChapter(span) !== fits(CORPUS, span) || choosable(span) !== addable(CORPUS, span),
      )
      .map(([kind, span]) => `${kind} ${JSON.stringify(span)}`);
    expect(wrong).toEqual([]);
    const tally = new Map<string, number>();
    for (const [kind, span] of ranges) {
      const verdict = `${kind}:${addable(CORPUS, span)}`;
      tally.set(verdict, (tally.get(verdict) ?? 0) + 1);
    }
    for (const verdict of [
      'one verse:true',
      '2-19 verses:true',
      '20 verses:true',
      '21 verses:false',
      '40 verses:false',
      'the whole chapter:true',
      'the whole chapter:false',
    ])
      expect(tally.get(verdict) ?? 0, verdict).toBeGreaterThan(20);
  });

  it('holds at the edges: Psalms 117 and 119, Isaiah 41:10 inside a range, exactly 20 and 21', () => {
    const psalm = (chapter: number, first: number, last: number) => ({
      book: 19,
      chapter,
      first,
      last,
    });
    expect(choosable(psalm(117, 1, 2))).toBe(true);
    expect(inChapter(psalm(117, 1, 3))).toBe(false);
    expect(choosable(psalm(119, 1, 20))).toBe(true);
    expect(choosable(psalm(119, 157, 176))).toBe(true);
    expect(choosable(psalm(119, 1, 21))).toBe(false);
    expect(inChapter(psalm(119, 1, 176))).toBe(true);
    expect(choosable(psalm(119, 1, 176))).toBe(false);
    expect(inChapter(psalm(119, 1, 177))).toBe(false);
    expect(choosable({ book: 23, chapter: 41, first: 1, last: 20 })).toBe(true);
    expect(choosable({ book: 23, chapter: 41, first: 10, last: 10 })).toBe(true);
    expect(choosable({ book: 23, chapter: 41, first: 10, last: 29 })).toBe(true);
    expect(choosable({ book: 23, chapter: 41, first: 10, last: 30 })).toBe(false);
  });
});

describe('the references', () => {
  it('name a verse and a passage as the canon writes them, in every book', () => {
    const next = random(1_5);
    const wrong = CORPUS.books.flatMap((book) => {
      const chapter = 1 + below(next, CORPUS.counts.get(book) ?? 1);
      const count = versesIn(CORPUS, book, chapter).length;
      const first = 1 + below(next, count);
      const last = Math.min(count, first + 1 + below(next, 19));
      const many = { book, chapter, first, last };
      const one = { book, chapter, first, last: first };
      return [
        [verseReference(book, chapter, first), verseRef(book, chapter, first)],
        [passageReference(one), spanRef(one)],
        [passageReference(many), spanRef(many)],
      ].flatMap(([got, want]) => (got === want ? [] : [`${got} for ${want}`]));
    });
    expect(wrong).toEqual([]);
    expect(NAMES.size).toBe(66);
  });

  it('write the canon’s names: Psalms, Song of Solomon, 1 John, and a one-verse range as its verse', () => {
    expect(verseReference(19, 23, 1)).toBe('Psalms 23:1');
    expect(passageReference({ book: 19, chapter: 23, first: 1, last: 6 })).toBe('Psalms 23:1-6');
    expect(passageReference({ book: 22, chapter: 2, first: 1, last: 1 })).toBe(
      'Song of Solomon 2:1',
    );
    expect(passageReference({ book: 62, chapter: 4, first: 7, last: 8 })).toBe('1 John 4:7-8');
    expect(passageReference({ book: 43, chapter: 15, first: 1, last: 5 })).toBe('John 15:1-5');
    expect(passageReference({ book: 23, chapter: 41, first: 10, last: 10 })).toBe('Isaiah 41:10');
  });
});
