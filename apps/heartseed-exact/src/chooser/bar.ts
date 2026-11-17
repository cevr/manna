/**
 * The chapter screen's selection and its bar, over the chooser's own rules
 * (`chooserStep` and `chooserShown`, unchanged): which verses of the
 * chapter are in the field, the quiet line that counts them, and what the
 * bar offers for the range chosen. The range belongs to the chapter it was
 * chosen in (`place`, `"<book>.<chapter>"`): on any other chapter it reads
 * as none, so moving to another chapter clears the selection. While every
 * chosen verse is in the field the bar says so and offers no button; a
 * landed plant (`Planted`) leaves "Planted." and Practise it now on the
 * first verse planted until the next tap, which starts a range afresh.
 * One verse chosen offers the study row (`study`, a slot `hs-read-study`
 * fills). At most one filled button is ever offered: Plant or Add to
 * single verses.
 */

import { slugOf } from '../garden/view';
import { verseReference } from '@manna/heartseed/passages';
import { fieldOf, gotoNext, gotoPlanted, gotoPrevious, type GotoChapter } from '../goto/goto';
import {
  chooserShown,
  chooserTap,
  countText,
  type ChooserRange,
  type ChooserShown,
} from './chooser';

/** The chapter screen: the chooser's footer for the range, the field's verses here, and the bar's offers. */
export interface ChapterShown extends ChooserShown {
  planted: number[];
  fieldLine: string;
  up: boolean;
  study: boolean;
  already: boolean;
  landed: boolean;
  practise: string;
  previous: GotoChapter;
  next: GotoChapter;
}

const NONE: ChooserRange = { first: 0, last: 0 };

/** A tap on `verse` of the chapter shown: the chooser's tap from the range held there, or from none once a plant has landed. */
export const chapterTap = (
  book: string,
  chapter: string,
  place: string,
  range: ChooserRange,
  answer: string,
  verse: number,
): ChooserRange => {
  if (answer === 'Planted' || place !== `${book}.${chapter}`)
    return chooserTap(book, chapter, NONE, verse);
  return chooserTap(book, chapter, range, verse);
};

/** The field's verses in this chapter as the quiet line under the title counts them; empty for none. */
export const fieldLineOf = (planted: number) => {
  if (planted === 0) return '';
  return `${countText(planted)} in your field`;
};

/** The chooser's footer over the range when it was chosen in this chapter, else over none. */
const footerOf = (
  book: string,
  chapter: string,
  place: string,
  range: ChooserRange,
  answer: string,
  singles: ReadonlyArray<string>,
) => {
  if (place === `${book}.${chapter}`) return chooserShown(book, chapter, range, answer, singles);
  return chooserShown(book, chapter, NONE, '', singles);
};

/** The footer's lines and offers while the bar offers a plant, else none of them. */
const offersOf = (shown: ChooserShown, open: boolean) => {
  if (open) return shown;
  return { ...shown, cap: '', short: '', line: '', lineId: '', plant: false, singles: false };
};

/** The slug of the first verse a landed plant planted, for Practise it now; empty before one lands. */
const practiseOf = (shown: ChooserShown, landed: boolean) => {
  if (!landed) return '';
  return slugOf(verseReference(shown.book, shown.chapter, shown.first));
};

/**
 * The chapter screen over the chapter the place names (`book`, `chapter`
 * as text), the range and the chapter it was chosen in, the last plant's
 * answer, the single verses' references and the whole field's references
 * (lists' and singles').
 */
export const chapterShown = (
  book: string,
  chapter: string,
  place: string,
  range: ChooserRange,
  answer: string,
  singles: ReadonlyArray<string>,
  field: ReadonlyArray<string>,
): ChapterShown => {
  const shown = footerOf(book, chapter, place, range, answer, singles);
  const planted = gotoPlanted(shown.book, shown.chapter, field);
  const inField = new Set(planted);
  const landed = shown.chosen && answer === 'Planted';
  const already =
    shown.chosen &&
    !landed &&
    Array.from({ length: shown.last - shown.first + 1 }, (_, index) => shown.first + index).every(
      (verse) => inField.has(verse),
    );
  return {
    ...offersOf(shown, shown.chosen && !landed && !already),
    planted,
    fieldLine: fieldLineOf(planted.length),
    up: shown.chosen,
    study: shown.chosen && !landed && shown.first === shown.last,
    already,
    landed,
    practise: practiseOf(shown, landed),
    previous: gotoPrevious(shown.book, shown.chapter),
    next: gotoNext(shown.book, shown.chapter),
  };
};

/** The chapter screen's sources, as `app.ts` registers them: the field and the single verses arrive as references joined by `|`. */
export const chapterSources = {
  chapterTap: ([book, chapter, place, first, last, answer, verse]: readonly [
    string,
    string,
    string,
    number,
    number,
    string,
    number,
  ]): ChooserRange => chapterTap(book, chapter, place, { first, last }, answer, verse),
  chapterRead: ([book, chapter, place, first, last, answer, singles, field]: readonly [
    string,
    string,
    string,
    number,
    number,
    string,
    string,
    string,
  ]): ChapterShown =>
    chapterShown(book, chapter, place, { first, last }, answer, fieldOf(singles), fieldOf(field)),
};
