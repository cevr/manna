/**
 * The Read tab's place: the chapter it shows and the verse it opens on.
 * The kept place is two texts kept by `persist` (`readBookKept`,
 * `readChapterKept`); a pair that names a chapter of the canon is answered
 * as kept, any other text falls to the chapter of the first verse in the
 * field (its reference, as the garden writes it), and with none to John 1.
 * A followed reference (`readAt`) is the route's own book, chapter and
 * verse, read by the same rule. The verse to open on is always inside the
 * chapter, or 0 for its top.
 */

import { BIBLE_BOOKS } from '@manna/core/bible';
import { versesOf } from '@manna/heartseed/kjv';
import { placeOf } from '@manna/heartseed/lists';
import { Array as Arr, Option } from 'effect';

/** A place of the Read tab: the chapter, the verse to open on (0 for the top), the chapter's name as its heading writes it, and the entry it was asked for (0 for the tab's root). */
export interface ReadPlace {
  id: number;
  book: number;
  chapter: number;
  verse: number;
  name: string;
}

/** Where Read opens with nothing kept and nothing planted. */
export const READ_FIRST = { book: 43, chapter: 1 } as const;

/** A route's or a kept text's whole number, or none. */
const wholeOf = (text: string): Option.Option<number> => {
  if (!/^[1-9]\d{0,2}$/u.test(text)) return Option.none();
  return Option.some(Number(text));
};

/** The chapter's name as a heading writes it ("John 3"). */
const nameOf = (book: number, chapter: number) =>
  `${Option.match(
    Arr.findFirst(BIBLE_BOOKS, (each) => each.number === book),
    { onNone: () => '', onSome: (each) => each.name },
  )} ${chapter}`;

/** The chapter two texts name, when the canon has it. */
const chapterOf = (bookText: string, chapterText: string) =>
  Option.filter(
    Option.all([wholeOf(bookText), wholeOf(chapterText)]),
    ([book, chapter]) => versesOf(book, chapter).length > 0,
  );

/** The verse to open on in a chapter: the verse when the chapter has it, else its top. */
const verseIn = (book: number, chapter: number, verse: number) => {
  if (verse >= 1 && verse <= versesOf(book, chapter).length) return verse;
  return 0;
};

const placeAt = (id: number, book: number, chapter: number, verse: number): ReadPlace => ({
  id,
  book,
  chapter,
  verse: verseIn(book, chapter, verse),
  name: nameOf(book, chapter),
});

/** The Read tab's root place: the kept chapter, else the chapter of the first verse in the field (opening on that verse), else John 1. */
export const readPlaceOf = (keptBook: string, keptChapter: string, first: string): ReadPlace =>
  Option.match(chapterOf(keptBook, keptChapter), {
    onSome: ([book, chapter]) => placeAt(0, book, chapter, 0),
    onNone: () =>
      Option.match(placeOf(first), {
        onSome: (verse) => placeAt(0, verse.book, verse.chapter, verse.verse),
        onNone: () => placeAt(0, READ_FIRST.book, READ_FIRST.chapter, 0),
      }),
  });

/** The place a followed reference's route names (entry `id`): its chapter and verse when the canon has the chapter, else the place Read opens on with nothing kept. */
export const readAtOf = (
  id: number,
  bookText: string,
  chapterText: string,
  verseText: string,
): ReadPlace =>
  Option.match(chapterOf(bookText, chapterText), {
    onSome: ([book, chapter]) =>
      placeAt(
        id,
        book,
        chapter,
        Option.getOrElse(wholeOf(verseText), () => 0),
      ),
    onNone: () => placeAt(id, READ_FIRST.book, READ_FIRST.chapter, 0),
  });

/** The Read tab's sources, as `app.ts` registers them. Each answers at once from the canon the data module imports, and touches no storage. */
export const readSources = {
  readPlaceOf: ([keptBook, keptChapter, first]: readonly [string, string, string]): ReadPlace =>
    readPlaceOf(keptBook, keptChapter, first),
  readAtOf: ([id, book, chapter, verse]: readonly [number, string, string, string]): ReadPlace =>
    readAtOf(id, book, chapter, verse),
};
