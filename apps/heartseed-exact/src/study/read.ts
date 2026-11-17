/* oxlint-disable effect/noNullish, effect/noTernary -- Exact's app folder cannot import effect (docs/exact.md): readers over a handed pack's plain strings. */

/**
 * The study packs' readers, each handed the pack it reads (none while the
 * pack is not on the phone), so where the bytes come from stays one
 * function away (`sources.ts`). Nothing is split at import: a chapter's
 * string is split when a verse of it is first asked for, a lexicon block
 * when an entry of it is, and each split is kept for that pack and counted
 * in `studySplits`, so a test can see a read split only what it needs.
 */

import { passageReference } from '@manna/heartseed/passages';

import { textOf } from '../text/text';
import { chapterIndex } from './canon';
import { lexiconLineOf, linePlace, numberPlace } from './lexicon';
import type { StudyPack } from './pack';
import { letterOf, tagsOfVerse, tagsVerses } from './tags';
import { shownWords } from './words';
import { xrefsOfVerse, xrefsVerses } from './xrefs';

/** Each split, in order, as `<what>:<part index>`: a test's counter. */
export const studySplits: Array<string> = [];

/** How many verses a cross-reference's text reads at most. */
export const XREF_VERSES = 3;

/** Each pack's parts split so far, by part index. */
const splits = new WeakMap<StudyPack, Map<number, ReadonlyArray<string>>>();

/** Part `index` of `pack` split by `split`, once per pack. */
const splitOf = (
  what: string,
  pack: StudyPack,
  index: number,
  split: (part: string) => ReadonlyArray<string>,
): ReadonlyArray<string> => {
  const held = splits.get(pack) ?? new Map<number, ReadonlyArray<string>>();
  splits.set(pack, held);
  const kept = held.get(index);
  if (kept !== undefined) return kept;
  const part = pack.parts[index];
  const made = part === undefined ? [] : split(part);
  studySplits.push(`${what}:${index}`);
  held.set(index, made);
  return made;
};

/** A chapter pack's string for `verse` of `chapter` of `book`; empty for none. */
const verseOf = (
  what: string,
  pack: StudyPack,
  book: number,
  chapter: number,
  verse: number,
  split: (part: string) => ReadonlyArray<string>,
): string => {
  const index = chapterIndex(book, chapter);
  if (index < 0 || !Number.isInteger(verse) || verse < 1) return '';
  return splitOf(what, pack, index, split)[verse - 1] ?? '';
};

/** A cross-reference as the reader shows it: its reference, place, and its words (at most `XREF_VERSES` verses). */
export interface StudyXref {
  reference: string;
  book: number;
  chapter: number;
  verse: number;
  last: number;
  text: string;
}

/** A verse's cross-references: whether the pack is on the phone, and each, in OpenBible.info's order. */
export interface StudyXrefs {
  have: boolean;
  refs: Array<StudyXref>;
}

/** The cross-references of a verse in `pack`; `have` false with no pack. */
export const xrefsRead = (
  pack: StudyPack | undefined,
  book: number,
  chapter: number,
  verse: number,
): StudyXrefs => {
  if (pack === undefined) return { have: false, refs: [] };
  const places = xrefsOfVerse(verseOf('xrefs', pack, book, chapter, verse, xrefsVerses));
  return {
    have: true,
    refs: places.map((place) => {
      const last = Math.max(place.verse, place.last);
      const read = textOf({
        book: place.book,
        chapter: place.chapter,
        first: place.verse,
        last: Math.min(last, place.verse + XREF_VERSES - 1),
      });
      return {
        reference: passageReference({ ...place, first: place.verse, last }),
        book: place.book,
        chapter: place.chapter,
        verse: place.verse,
        last,
        text: read.verses.map((shown) => shown.text).join(' '),
      };
    }),
  };
};

/** A shown word: its place in the verse, its text and UTF-16 offsets, its Strong's numbers with their letter, and whether the translators added it. */
export interface StudyWord {
  index: number;
  text: string;
  start: number;
  end: number;
  numbers: Array<string>;
  added: boolean;
}

/** A verse's shown words: whether the tags are on the phone, and each word, tagged when they are. */
export interface StudyWords {
  have: boolean;
  words: Array<StudyWord>;
}

/** The shown words of a verse, each with its tags in `pack`; `have` false with no pack, the words untagged. */
export const wordsRead = (
  pack: StudyPack | undefined,
  book: number,
  chapter: number,
  verse: number,
): StudyWords => {
  const text = textOf({ book, chapter, first: verse, last: verse }).verses[0]?.text;
  if (text === undefined) return { have: pack !== undefined, words: [] };
  const tags =
    pack === undefined
      ? undefined
      : tagsOfVerse(verseOf('tags', pack, book, chapter, verse, tagsVerses));
  const letter = letterOf(book);
  return {
    have: pack !== undefined,
    words: shownWords(text).map((word, index) => {
      const tag = tags?.[index];
      return {
        index,
        text: word.text,
        start: word.start,
        end: word.end,
        numbers: (tag?.numbers ?? []).map((n) => `${letter}${n}`),
        added: tag?.added ?? false,
      };
    }),
  };
};

/** A verse's counts: its cross-references, and its words that carry a number. */
export interface StudyVerseCount {
  verse: number;
  xrefs: number;
  words: number;
}

/** A chapter's counts: whether each pack is on the phone, and each verse, ascending. */
export interface StudyCounts {
  xrefsHave: boolean;
  wordsHave: boolean;
  verses: Array<StudyVerseCount>;
}

/** Each verse's counts in `book` `chapter`, from the packs on the phone; a pack not there counts 0. */
export const countsRead = (
  xrefs: StudyPack | undefined,
  tags: StudyPack | undefined,
  book: number,
  chapter: number,
): StudyCounts => {
  const verses = textOf({ book, chapter, first: 1, last: Number.MAX_SAFE_INTEGER }).verses;
  return {
    xrefsHave: xrefs !== undefined,
    wordsHave: tags !== undefined,
    verses: verses.map(({ verse }) => ({
      verse,
      xrefs:
        xrefs === undefined
          ? 0
          : xrefsOfVerse(verseOf('xrefs', xrefs, book, chapter, verse, xrefsVerses)).length,
      words:
        tags === undefined
          ? 0
          : (tagsOfVerse(verseOf('tags', tags, book, chapter, verse, tagsVerses)) ?? []).filter(
              (tag) => tag.numbers.length > 0,
            ).length,
    })),
  };
};

/** A Strong's entry as the reader shows it. */
export interface StudyEntry {
  have: boolean;
  found: boolean;
  number: string;
  language: string;
  lemma: string;
  xlit: string;
  pron: string;
  def: string;
  renders: Array<{ word: string; count: number }>;
  total: number;
}

/** `number`'s entry in `pack`; `have` false with no pack, `found` false for a number it lacks. */
export const entryRead = (pack: StudyPack | undefined, number: string): StudyEntry => {
  const place = numberPlace(number);
  const empty: StudyEntry = {
    have: pack !== undefined,
    found: false,
    number,
    language: place === undefined ? '' : place.letter === 'H' ? 'Hebrew' : 'Greek',
    lemma: '',
    xlit: '',
    pron: '',
    def: '',
    renders: [],
    total: 0,
  };
  if (pack === undefined || place === undefined) return empty;
  const at = linePlace(pack.parts, place);
  if (at === undefined) return empty;
  const line = lexiconLineOf(
    splitOf('lexicon', pack, at[0], (part) => part.split('\n'))[at[1]] ?? '',
  );
  if (line === undefined) return empty;
  return {
    ...empty,
    found: true,
    lemma: line.lemma,
    xlit: line.xlit,
    pron: line.pron,
    def: line.def,
    renders: line.renders.map((render) => ({ ...render })),
    total: line.total,
  };
};
