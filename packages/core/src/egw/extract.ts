/**
 * The `paragraph_bible_refs` rows of EGW paragraphs: which verses each
 * paragraph comments on, so a reader can ask "show me EGW commentary on
 * Genesis 3:1" without an FTS scan.
 *
 * The verses are read by `commentary-links.ts`, the one reading the stored
 * rows, the study and the commentary pack share; this module keys them by
 * paragraph and book for storage.
 */

import { Option, Predicate } from 'effect';

import { citationVerses, type VersesReader } from './commentary-links.js';
import type { Paragraph } from './schemas.js';

interface ExtractedBibleRef {
  readonly bookId: number;
  readonly refCode: string;
  readonly bibleBook: number;
  readonly bibleChapter: number;
  /** Absent when the reference targets a whole chapter (e.g. "Genesis 3"). */
  readonly bibleVerse: Option.Option<number>;
}

/** Canonical non-empty refcode for paragraph storage and Bible-reference joins. */
export const paragraphRefcode = (paragraph: Paragraph, bookId: number): string => {
  const short = Option.getOrUndefined(paragraph.refcode_short);
  if (Predicate.isNotUndefined(short)) return short;
  const long = paragraph.refcode_long;
  if (Predicate.isNotNullish(long) && long.length > 0) return long;
  return Option.getOrElse(
    paragraph.para_id,
    () => `book-${String(bookId)}-para-${String(paragraph.puborder)}`,
  );
};

/**
 * The rows `paragraphs` link, in order: each paragraph's verses as `read`
 * reads them (its citations by default; a volume laid out by verse headings
 * passes `readerFor(code)`), one row per verse, a whole chapter as an absent
 * `bibleVerse`, each (paragraph, verse) once.
 */
export const extractScriptureRefs = (
  paragraphs: readonly Paragraph[],
  bookId: number,
  refcodeOf: (paragraph: Paragraph, bookId: number) => string = paragraphRefcode,
  read: VersesReader = citationVerses,
): readonly ExtractedBibleRef[] => {
  const verses = read(paragraphs);
  const seen = new Set<string>();
  const out: ExtractedBibleRef[] = [];
  paragraphs.forEach((paragraph, index) => {
    const refCode = refcodeOf(paragraph, bookId);
    for (const row of verses[index] ?? []) {
      const key = `${refCode}|${String(row.bibleBook)}|${String(row.bibleChapter)}|${String(Option.getOrElse(row.bibleVerse, () => -1))}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ bookId, refCode, ...row });
    }
  });
  return out;
};
