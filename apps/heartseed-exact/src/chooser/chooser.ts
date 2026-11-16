/**
 * The chooser's rules: the books under their testaments, a book's
 * chapters, and a chapter's range as the reader taps it. The range is one
 * pure `chooserStep` over the current Heartseed's `tapVerse`; what the
 * footer says of it is `chooserShown`, the current chooser's: the range's
 * reference and count, the cap, `Plant` once the range holds 3 verses or
 * more (`isShort`), `SHORT_LINE` in its place while it holds fewer, with
 * the offer to join its verses to the single verses while they have room
 * (the owner's rule: fewer than three is refused as a list, and one or two
 * join the single verses, as a shelf's short pick does), and, after a
 * plant's answer, the limit line of what was planted on `Full` or the
 * alert on any other refusal. The words it shows come from `textVerses`
 * (`src/text/`), never from here.
 * Contract hands a route's book and chapter as text; a text that names no
 * book or chapter of the canon reads as none.
 */

import { BIBLE_BOOKS } from '@manna/core/bible';
import { LIMIT_LINE, SHORT_LINE, SINGLES_LIMIT_LINE, tapVerse } from '@manna/heartseed/chooser';
import { versesOf } from '@manna/heartseed/kjv';
import {
  isShort,
  LEAST_VERSES,
  MOST_SINGLES,
  MOST_VERSES,
  passageReference,
} from '@manna/heartseed/passages';
import { Option } from 'effect';

/** A book as the chooser lists it. */
export interface ChooserBook {
  number: number;
  name: string;
  chapters: number;
}

/** A testament's label and its books, in canon order. */
export interface ChooserTestament {
  label: string;
  books: ChooserBook[];
}

/** The books step. */
export interface ChooserBooks {
  heading: string;
  testaments: ChooserTestament[];
}

/** The chapters step: the book named, or `found` false. */
export interface ChooserChapters {
  found: boolean;
  number: number;
  name: string;
  chapters: number[];
}

/** The verses chosen, first to last; `0`, `0` for none. */
export interface ChooserRange {
  first: number;
  last: number;
}

/** The verses step's footer: the chapter's heading, its verse count, the range and what it offers. */
export interface ChooserShown {
  found: boolean;
  book: number;
  chapter: number;
  heading: string;
  count: number;
  chosen: boolean;
  first: number;
  last: number;
  reference: string;
  countText: string;
  cap: string;
  short: string;
  plant: boolean;
  singles: boolean;
  line: string;
  lineId: string;
}

/** The two testaments' labels, as the current chooser writes them. */
export const CHOOSER_TESTAMENTS = [
  { label: 'Old Testament', testament: 'old' },
  { label: 'New Testament', testament: 'new' },
] as const;

/** The books step's heading, as the current chooser writes it. */
export const CHOOSER_HEADING = 'Add a passage';

const NONE: ChooserRange = { first: 0, last: 0 };

const bookOf = (number: number) =>
  Option.fromUndefinedOr(BIBLE_BOOKS.find((book) => book.number === number));

/** A route's whole number, or none. */
const wholeOf = (text: string): Option.Option<number> => {
  if (!/^[1-9]\d{0,2}$/u.test(text)) return Option.none();
  return Option.some(Number(text));
};

/** The books step. */
export const chooserBooks = (): ChooserBooks => ({
  heading: CHOOSER_HEADING,
  testaments: CHOOSER_TESTAMENTS.map(({ label, testament }) => ({
    label,
    books: BIBLE_BOOKS.filter((book) => book.testament === testament).map((book) => ({
      number: book.number,
      name: book.name,
      chapters: book.chapters,
    })),
  })),
});

/** The chapters of the book the route names. */
export const chooserChapters = (bookText: string): ChooserChapters =>
  Option.match(Option.flatMap(wholeOf(bookText), bookOf), {
    onNone: () => ({ found: false, number: 0, name: '', chapters: [] }),
    onSome: (book) => ({
      found: true,
      number: book.number,
      name: book.name,
      chapters: Array.from({ length: book.chapters }, (_, index) => index + 1),
    }),
  });

/** The range as `tapVerse` holds it. */
const versesIn = (range: ChooserRange) => {
  if (range.first < 1 || range.last < range.first) return Option.none();
  return Option.some({ first: range.first, last: range.last });
};

/** The range after a tap on `verse` of a chapter of `count` verses: the current chooser's `tapVerse`. */
export const chooserStep = (range: ChooserRange, verse: number, count: number): ChooserRange =>
  Option.match(tapVerse(versesIn(range), verse, count), {
    onNone: () => NONE,
    onSome: (chosen) => ({ first: chosen.first, last: chosen.last }),
  });

/** The book and chapter a route names, and the chapter's verse count; none outside the canon. */
const placeOf = (bookText: string, chapterText: string) =>
  Option.flatMap(
    Option.all([Option.flatMap(wholeOf(bookText), bookOf), wholeOf(chapterText)]),
    ([book, chapter]) => {
      const count = versesOf(book.number, chapter).length;
      if (count === 0) return Option.none();
      return Option.some({ book, chapter, count });
    },
  );

/** A tap on `verse` in the chapter the route names, from `range`; a chapter the canon lacks keeps no range. */
export const chooserTap = (
  bookText: string,
  chapterText: string,
  range: ChooserRange,
  verse: number,
): ChooserRange =>
  Option.match(placeOf(bookText, chapterText), {
    onNone: () => NONE,
    onSome: ({ count }) => chooserStep(range, verse, count),
  });

/** A range's count as the current footer writes it. */
export const countText = (verses: number) => {
  if (verses === 1) return '1 verse';
  return `${verses} verses`;
};

/** The alert a refused plant leaves, as the current chooser writes it. */
export const notPlantedLine = (reference: string) => `${reference} was not planted. Try again.`;

/** The single verses' limit line, as the chooser names it. */
const SINGLES_FULL = { line: SINGLES_LIMIT_LINE, lineId: 'chooser-singles-limit' };

/** The line a plant's answer leaves under the footer: none for no answer and for a plant that landed, on `Full` the limit line of what was planted (a short range joins the single verses), else the alert; with no answer, the single verses' limit line while a short range has no room among them. */
const lineOf = (answer: string, reference: string, short: boolean, room: boolean) => {
  if (answer === '' && short && !room) return SINGLES_FULL;
  if (answer === '' || answer === 'Planted' || answer === 'Already')
    return { line: '', lineId: '' };
  if (answer === 'Full' && short) return SINGLES_FULL;
  if (answer === 'Full') return { line: LIMIT_LINE, lineId: 'chooser-limit' };
  return { line: notPlantedLine(reference), lineId: 'chooser-alert' };
};

/**
 * The verses step over the chapter the route names, the range chosen, the
 * last plant's answer for it (empty for none) and the count of single
 * verses held. A range of one or two verses is offered to the single
 * verses (`singles`) while they have room for each of its verses.
 */
export const chooserShown = (
  bookText: string,
  chapterText: string,
  range: ChooserRange,
  answer: string,
  singlesHeld: number,
): ChooserShown => {
  const cap = `${LEAST_VERSES} to ${MOST_VERSES} verses`;
  return Option.match(placeOf(bookText, chapterText), {
    onNone: () => ({
      found: false,
      book: 0,
      chapter: 0,
      heading: '',
      count: 0,
      chosen: false,
      first: 0,
      last: 0,
      reference: '',
      countText: '',
      cap,
      short: '',
      plant: false,
      singles: false,
      line: '',
      lineId: '',
    }),
    onSome: ({ book, chapter, count }) => {
      const chosen = Option.filter(
        versesIn(range),
        (each) => each.last <= count && each.last - each.first < MOST_VERSES,
      );
      const passage = Option.map(chosen, (each) => ({ book: book.number, chapter, ...each }));
      const reference = Option.match(passage, { onNone: () => '', onSome: passageReference });
      const short = Option.exists(passage, isShort);
      const room = Option.exists(
        passage,
        (each) => singlesHeld + each.last - each.first + 1 <= MOST_SINGLES,
      );
      return {
        found: true,
        book: book.number,
        chapter,
        heading: `${book.name} ${chapter}`,
        count,
        chosen: Option.isSome(passage),
        first: Option.match(passage, { onNone: () => 0, onSome: (each) => each.first }),
        last: Option.match(passage, { onNone: () => 0, onSome: (each) => each.last }),
        reference,
        countText: Option.match(passage, {
          onNone: () => '',
          onSome: (each) => countText(each.last - each.first + 1),
        }),
        cap,
        short: Option.match(
          Option.liftPredicate(SHORT_LINE, () => short),
          {
            onNone: () => '',
            onSome: (line) => line,
          },
        ),
        plant: Option.isSome(passage) && !short,
        singles: short && room,
        ...Option.match(passage, {
          onNone: () => ({ line: '', lineId: '' }),
          onSome: () => lineOf(answer, reference, short, room),
        }),
      };
    },
  });
};
