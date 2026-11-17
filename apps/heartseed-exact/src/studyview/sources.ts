/* oxlint-disable effect/noAsyncFunction, effect/noNewPromise, effect/noTernary -- Exact's data module answers a Promise, and its app folder cannot import effect (docs/exact.md): a source reads its packs at once. */

/**
 * The study sheet's sources (q118, q120, q122), over the packs the one
 * downloader keeps, read through their own readers (`src/study/read.ts`,
 * `src/commentary/pack.ts`), never decoded here:
 *
 * - `studyBarRead(book, chapter, xrefsMark, tagsMark, notesMark)`: the bar's
 *   three buttons for every verse of the chapter, asked once per chapter,
 *   so a tap waits on nothing;
 * - `studySheetRead(book, chapter, verse, xrefsMark, tagsMark, notesMark, held)`:
 *   the sheet but the open word;
 * - `studyWordRead(book, chapter, verse, word, tagsMark, lexiconMark)`: the
 *   open word (by its tap's index or its hold's offset) and its entries;
 * - `studyReturnRead(backs, top, ids)`: where Back from a followed
 *   cross-reference returns (`back.ts`).
 *
 * Each mark is a pack's kept version, so a pack that lands is read again.
 */

import type { FileStorage } from '@manna/exact-kit/storage';
import { verseReference } from '@manna/heartseed/passages';

import { COMMENTARY } from '../commentary/sources';
import { countsOf, readOf } from '../commentary/pack';
import type { ExactStore, packSources } from '../packs/sources';
import { countsRead, entryRead, wordsRead, xrefsRead } from '../study/read';
import { STUDY_LEXICON, STUDY_TAGS, STUDY_XREFS } from '../study/sources';
import { letterOf } from '../study/tags';
import { studyButtonsOf, type StudyButton } from './bar';
import { studyReturnOf, type StudyReturn } from './back';
import {
  NO_WORD,
  placeKey,
  sheetOf,
  wordIndexOf,
  wordOpenOf,
  type StudySheetShown,
  type StudyWaiting,
  type StudyWordOpen,
} from './sheet';

/** The downloader the sheet reads through. */
type Packs = Pick<ReturnType<typeof packSources>, 'packOf'>;

/** The bar's buttons for one verse. */
export interface StudyBarVerse {
  verse: number;
  buttons: Array<StudyButton>;
}

/** The bar's buttons for every verse of a chapter. */
export interface StudyBarShown {
  verses: Array<StudyBarVerse>;
}

/** Each pack's own waiting line. */
const WAITING: StudyWaiting = {
  xrefs: STUDY_XREFS.waiting,
  tags: STUDY_TAGS.waiting,
  commentary: COMMENTARY.waiting,
  lexicon: STUDY_LEXICON.waiting,
};

/** A verse's language: Hebrew in books 1-39, else Greek. */
export const languageOf = (book: number): string => (letterOf(book) === 'H' ? 'Hebrew' : 'Greek');

/** A source's numbers, as the Contract hands them (route parameters are text). */
const numberOf = (value: number | string): number => Number(value);

/** The sheet's sources over `packs`. */
export const studyviewSources = (packs: Packs) => ({
  studyBarRead: async (
    [bookArg, chapterArg, xrefsMark, tagsMark, notesMark]: readonly [
      number | string,
      number | string,
      string,
      string,
      string,
    ],
    _store: ExactStore,
    storage: FileStorage,
  ): Promise<StudyBarShown> => {
    const book = numberOf(bookArg);
    const chapter = numberOf(chapterArg);
    const [xrefs, tags, notes] = await Promise.all([
      packs.packOf(STUDY_XREFS, xrefsMark, storage),
      packs.packOf(STUDY_TAGS, tagsMark, storage),
      packs.packOf(COMMENTARY, notesMark, storage),
    ]);
    const counts = countsRead(xrefs, tags, book, chapter);
    const noted = countsOf(notes, book, chapter);
    const language = languageOf(book);
    return {
      verses: counts.verses.map((each) => ({
        verse: each.verse,
        buttons: studyButtonsOf({
          reference: verseReference(book, chapter, each.verse),
          language,
          xrefsHave: counts.xrefsHave,
          xrefs: each.xrefs,
          wordsHave: counts.wordsHave,
          words: each.words,
          notesHave: noted.have,
          notes: noted.verses.find((v) => v.verse === each.verse)?.notes ?? 0,
        }),
      })),
    };
  },
  studySheetRead: async (
    [bookArg, chapterArg, verseArg, xrefsMark, tagsMark, notesMark, held]: readonly [
      number | string,
      number | string,
      number | string,
      string,
      string,
      string,
      boolean,
    ],
    _store: ExactStore,
    storage: FileStorage,
  ): Promise<StudySheetShown> => {
    const book = numberOf(bookArg);
    const chapter = numberOf(chapterArg);
    const verse = numberOf(verseArg);
    const [xrefs, tags, notes] = await Promise.all([
      packs.packOf(STUDY_XREFS, xrefsMark, storage),
      packs.packOf(STUDY_TAGS, tagsMark, storage),
      packs.packOf(COMMENTARY, notesMark, storage),
    ]);
    return sheetOf({
      book,
      chapter,
      verse,
      reference: verseReference(book, chapter, verse),
      language: languageOf(book),
      xrefs: xrefsRead(xrefs, book, chapter, verse),
      words: wordsRead(tags, book, chapter, verse),
      notes: readOf(notes, book, chapter),
      held,
      waiting: WAITING,
    });
  },
  studyWordRead: async (
    [bookArg, chapterArg, verseArg, word, tagsMark, lexiconMark]: readonly [
      number | string,
      number | string,
      number | string,
      string,
      string,
      string,
    ],
    _store: ExactStore,
    storage: FileStorage,
  ): Promise<StudyWordOpen> => {
    const book = numberOf(bookArg);
    const chapter = numberOf(chapterArg);
    const verse = numberOf(verseArg);
    const place = placeKey(book, chapter, verse);
    if (!word.startsWith(`${place}:`)) return NO_WORD;
    const [tags, lexicon] = await Promise.all([
      packs.packOf(STUDY_TAGS, tagsMark, storage),
      packs.packOf(STUDY_LEXICON, lexiconMark, storage),
    ]);
    const words = wordsRead(tags, book, chapter, verse);
    return wordOpenOf(
      words,
      wordIndexOf(word, place, verse, words),
      place,
      (number) => entryRead(lexicon, number),
      WAITING.lexicon,
    );
  },
  studyReturnRead: ([backs, top, ids]: readonly [string, number, string]): StudyReturn =>
    studyReturnOf(
      backs,
      top,
      ids
        .split(' ')
        .filter((id) => id !== '')
        .map(Number),
    ),
});
