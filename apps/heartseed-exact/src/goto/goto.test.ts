/* oxlint-disable effect/noNullish -- a test's oracle: a reference outside the pool reads as no chapter. */

/**
 * Go to's rules as properties (spec, acceptance 3): over generated fields,
 * Where your verses grow lists each chapter of the field once, in field
 * order, at most 12, and passes over a text the canon lacks; previous and
 * next walk all 1,189 chapters end to end and back, with none before
 * Genesis 1 or after Revelation 22; a chapter's planted marks and a book's
 * grid dots are exactly the field's verses there; a reference's place is
 * its chapter and verse. Fields are drawn from verse references the
 * current app writes (`verseReference`), never from verse text.
 */

import { BIBLE_BOOKS } from '@manna/core/bible';
import { expect, it } from 'bun:test';

import { versesOf } from '@manna/heartseed/kjv';
import { verseReference } from '@manna/heartseed/passages';
import { seeded, type Random } from '../test/random';
import {
  fieldOf,
  GOTO_GROW_MOST,
  gotoBook,
  gotoGrow,
  gotoNext,
  gotoPlaceOf,
  gotoPlanted,
  gotoPrevious,
} from './goto';

/** Every chapter of the canon in order: book and chapter. */
const CANON = BIBLE_BOOKS.flatMap((book) =>
  Array.from({ length: book.chapters }, (_, index) => ({ book: book.number, chapter: index + 1 })),
);

/** A few chapters a generated field draws from, so chapters repeat. */
const POOL = [
  [43, 3],
  [19, 23],
  [19, 119],
  [1, 1],
  [66, 22],
  [23, 41],
  [45, 8],
  [40, 5],
  [20, 3],
  [58, 11],
  [62, 4],
  [19, 1],
  [43, 1],
  [49, 2],
  [50, 4],
] as const;

/** A generated field: references of verses in the pool's chapters, with a few the canon lacks. */
const fieldFrom = (random: Random) =>
  Array.from({ length: random.below(30) }, () => {
    if (random.chance(0.05)) return random.pick(['John 3:99', 'Nothing 1:1', '']);
    const [book, chapter] = random.pick(POOL);
    return verseReference(book, chapter, 1 + random.below(versesOf(book, chapter).length));
  });

/** Each verse reference of the pool's chapters, to its chapter as `book.chapter`. */
const KEYS = new Map(
  POOL.flatMap(([book, chapter]) =>
    versesOf(book, chapter).map(
      (_, index) => [verseReference(book, chapter, index + 1), `${book}.${chapter}`] as const,
    ),
  ),
);

/** The chapter a reference of the pool names, as `book.chapter`. */
const chapterKey = (reference: string) => KEYS.get(reference) ?? '';

it('lists each chapter of the field once, in field order, at most twelve', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const field = fieldFrom(seeded(seed));
    const expected = [...new Set(field.map(chapterKey).filter((key) => key !== ''))].slice(
      0,
      GOTO_GROW_MOST,
    );
    expect(gotoGrow(field).map((each) => `${each.book}.${each.chapter}`)).toEqual(expected);
  }
  expect(gotoGrow([])).toEqual([]);
  expect(gotoGrow(['John 3:16']).map((each) => each.name)).toEqual(['John 3']);
});

it('walks every chapter end to end by next and back by previous, with none past either end', () => {
  expect(CANON.length).toBe(1189);
  let at = gotoNext(1, 0);
  expect(at.found).toBe(false);
  at = { found: true, book: 1, chapter: 1, name: 'Genesis 1' };
  const walked = [at];
  for (;;) {
    const next = gotoNext(at.book, at.chapter);
    if (!next.found) break;
    walked.push(next);
    at = next;
  }
  expect(walked.map((each) => `${each.book}.${each.chapter}`)).toEqual(
    CANON.map((each) => `${each.book}.${each.chapter}`),
  );
  const back = [at];
  for (;;) {
    const previous = gotoPrevious(at.book, at.chapter);
    if (!previous.found) break;
    back.push(previous);
    at = previous;
  }
  expect(back.map((each) => `${each.book}.${each.chapter}`)).toEqual(
    walked.map((each) => `${each.book}.${each.chapter}`).toReversed(),
  );
  expect(gotoPrevious(1, 1).found).toBe(false);
  expect(gotoNext(66, 22).found).toBe(false);
  expect(gotoNext(43, 21)).toEqual({ found: true, book: 44, chapter: 1, name: 'Acts 1' });
  expect(gotoPrevious(44, 1)).toEqual({ found: true, book: 43, chapter: 21, name: 'John 21' });
  expect([gotoNext(67, 1).found, gotoPrevious(0, 1).found, gotoNext(43, 22).found]).toEqual([
    false,
    false,
    false,
  ]);
});

it("marks exactly the field's verses in a chapter, and a book's chapters that hold one", () => {
  for (let seed = 1; seed <= 100; seed++) {
    const random = seeded(seed);
    const field = fieldFrom(random);
    const [book, chapter] = random.pick(POOL);
    const held = new Set(field);
    expect(gotoPlanted(book, chapter, field)).toEqual(
      versesOf(book, chapter)
        .map((_, index) => index + 1)
        .filter((verse) => held.has(verseReference(book, chapter, verse))),
    );
    const grid = gotoBook(`${book}`, book, chapter, field);
    const chapters = new Set(
      field
        .map(chapterKey)
        .filter((key) => key.startsWith(`${book}.`))
        .map((key) => Number(key.split('.')[1])),
    );
    expect(grid.chapters.filter((cell) => cell.planted).map((cell) => cell.chapter)).toEqual(
      [...chapters].toSorted((one, other) => one - other),
    );
    expect(grid.chapters.filter((cell) => cell.current).map((cell) => cell.chapter)).toEqual([
      chapter,
    ]);
  }
});

it('answers the first planted and the none cases', () => {
  expect(gotoPlanted(43, 3, [])).toEqual([]);
  expect(gotoPlanted(43, 3, ['John 3:16', 'John 3:17', 'John 4:1'])).toEqual([16, 17]);
  expect(gotoBook('19', 43, 3, []).chapters).toHaveLength(150);
  expect(gotoBook('19', 43, 3, []).chapters.some((cell) => cell.current || cell.planted)).toBe(
    false,
  );
  expect(gotoBook('0', 43, 3, []).found).toBe(false);
  expect(gotoBook('john', 43, 3, []).found).toBe(false);
  expect(gotoPlaceOf('Psalms 119:105')).toEqual({
    found: true,
    book: 19,
    chapter: 119,
    verse: 105,
    name: 'Psalms 119',
  });
  expect(gotoPlaceOf('').found).toBe(false);
  expect(fieldOf('John 3:16||Psalms 23:1')).toEqual(['John 3:16', 'Psalms 23:1']);
});
