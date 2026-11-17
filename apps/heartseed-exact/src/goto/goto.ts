/**
 * Go to's rules and the chapter's neighbours: where the reader's verses
 * grow (each chapter of the field once, in field order, at most
 * `GOTO_GROW_MOST`), a book's chapters with the current one and the ones
 * holding a planted verse marked, the chapter before and after a chapter
 * across a book's edge (none before Genesis 1 or after Revelation 22), the
 * verses of a chapter that are in the field, and the chapter a reference
 * names (the book buttons on a list's page and on Today). The field is
 * every verse reference the garden holds, lists first, as the garden
 * writes them; a reference the canon lacks is passed over.
 */

import { BIBLE_BOOKS } from '@manna/core/bible';
import { versesOf } from '@manna/heartseed/kjv';
import { placeOf } from '@manna/heartseed/lists';
import { verseReference } from '@manna/heartseed/passages';
import { Array as Arr, Option } from 'effect';

/** The most chapters Where your verses grow lists. */
export const GOTO_GROW_MOST = 12;

/** A chapter as a chip names it; `found` false for none. */
export interface GotoChapter {
  found: boolean;
  book: number;
  chapter: number;
  name: string;
}

/** A verse's chapter and the verse, as a book button opens it. */
export interface GotoPlace {
  found: boolean;
  book: number;
  chapter: number;
  verse: number;
  name: string;
}

/** One chapter of a book's grid: `current` for the chapter shown, `planted` when a verse of it is in the field. */
export interface GotoCell {
  chapter: number;
  current: boolean;
  planted: boolean;
}

/** A book's grid; `found` false when the route names no book. */
export interface GotoBook {
  found: boolean;
  number: number;
  name: string;
  chapters: GotoCell[];
}

const NONE: GotoChapter = { found: false, book: 0, chapter: 0, name: '' };

const bookOf = (number: number) => Arr.findFirst(BIBLE_BOOKS, (book) => book.number === number);

const chapterAt = (book: number, chapter: number): GotoChapter =>
  Option.match(bookOf(book), {
    onNone: () => NONE,
    onSome: (each) => ({ found: true, book, chapter, name: `${each.name} ${chapter}` }),
  });

/** Each place of the field the canon has, in field order. */
const placesOf = (field: ReadonlyArray<string>) =>
  field.flatMap((reference) =>
    Option.match(placeOf(reference), { onNone: () => [], onSome: (place) => [place] }),
  );

/** The chapters that hold a verse of the field, each once, in field order, at most `GOTO_GROW_MOST`. */
export const gotoGrow = (field: ReadonlyArray<string>): GotoChapter[] => {
  const seen = new Set<string>();
  const grown: GotoChapter[] = [];
  for (const place of placesOf(field)) {
    const key = `${place.book}.${place.chapter}`;
    if (seen.has(key) || grown.length >= GOTO_GROW_MOST) continue;
    seen.add(key);
    grown.push(chapterAt(place.book, place.chapter));
  }
  return grown;
};

/** The chapter before `chapter` of `book`, across a book's edge; none before Genesis 1 or outside the canon. */
export const gotoPrevious = (book: number, chapter: number): GotoChapter => {
  if (Option.isNone(bookOf(book)) || chapter < 1) return NONE;
  if (chapter > 1) return chapterAt(book, chapter - 1);
  return Option.match(bookOf(book - 1), {
    onNone: () => NONE,
    onSome: (before) => chapterAt(before.number, before.chapters),
  });
};

/** The chapter after `chapter` of `book`, across a book's edge; none after Revelation 22 or outside the canon. */
export const gotoNext = (book: number, chapter: number): GotoChapter =>
  Option.match(bookOf(book), {
    onNone: () => NONE,
    onSome: (each) => {
      if (chapter < 1 || chapter > each.chapters) return NONE;
      if (chapter < each.chapters) return chapterAt(book, chapter + 1);
      return Option.match(bookOf(book + 1), {
        onNone: () => NONE,
        onSome: (after) => chapterAt(after.number, 1),
      });
    },
  });

/** The verses of a chapter that are in the field, ascending. */
export const gotoPlanted = (
  book: number,
  chapter: number,
  field: ReadonlyArray<string>,
): number[] => {
  const held = new Set(field);
  return versesOf(book, chapter)
    .map((_, index) => index + 1)
    .filter((verse) => held.has(verseReference(book, chapter, verse)));
};

/** Whether a chapter holds a verse of the field. */
const plantedIn = (field: ReadonlyArray<string>) => {
  const chapters = new Set(placesOf(field).map((place) => `${place.book}.${place.chapter}`));
  return (book: number, chapter: number) => chapters.has(`${book}.${chapter}`);
};

/** A book's grid as the route names it (its number as text), the chapter shown ringed and the chapters with a planted verse marked. */
export const gotoBook = (
  bookText: string,
  shownBook: number,
  shownChapter: number,
  field: ReadonlyArray<string>,
): GotoBook => {
  const number = Option.liftPredicate(bookText, (text) => /^[1-9]\d?$/u.test(text));
  return Option.match(
    Option.flatMap(number, (text) => bookOf(Number(text))),
    {
      onNone: () => ({ found: false, number: 0, name: '', chapters: [] }),
      onSome: (book) => {
        const planted = plantedIn(field);
        return {
          found: true,
          number: book.number,
          name: book.name,
          chapters: Array.from({ length: book.chapters }, (_, index) => ({
            chapter: index + 1,
            current: book.number === shownBook && index + 1 === shownChapter,
            planted: planted(book.number, index + 1),
          })),
        };
      },
    },
  );
};

/** The chapter and verse a reference names, as a book button opens it ("Read John 3"); `found` false for any other text. */
export const gotoPlaceOf = (reference: string): GotoPlace =>
  Option.match(placeOf(reference), {
    onNone: () => ({ found: false, book: 0, chapter: 0, verse: 0, name: '' }),
    onSome: (place) => ({ ...chapterAt(place.book, place.chapter), verse: place.verse }),
  });

/** The field's references as the contract hands them, joined by `|`. */
export const fieldOf = (text: string) => text.split('|').filter((reference) => reference !== '');
