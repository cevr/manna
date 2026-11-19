/* oxlint-disable effect/noNullish, effect/noTernary -- Exact's data module cannot import effect (docs/exact.md): a hymn the shipped chords do not hold is undefined, and the rules branch plainly. */

/**
 * The page shown for a hymn: `pageAt`'s, with what the current app draws
 * over and in it: the quiet head line (`headLine`, the section and its
 * passages) and each printed line as its words, each word as its
 * syllables, from the hymn's shipped chords as the current app reads them
 * (`sectionsOf`), with chords on or off; a part the chords do not split, or
 * a hymn they do not hold, is its words, each one syllable. A word but the
 * line's last ends in a no-break space, as the current app's words do
 * (`SyllableWords.tsx`). The passages are read from the indexes the build
 * bundles, as the home's are (`home/sources.ts`).
 */

import type { HymnChords, Word } from '@manna/hymnal-app/hymns/chords';
import { sectionsOf } from '@manna/hymnal-app/hymns/chords';
import { headLine } from '@manna/hymnal-app/reader/head-line';
import bundled from 'virtual:hymnal-indexes';

import type { Book } from '../hymns/book.ts';
import { hymnAt, missing, type Page, type PageLine, type PageWord, pageOf } from './page.ts';

/** The passages hymn `number` alludes to, in the Scriptural index's printed order, as the current app's `referencesOf` gives them. */
const referencesOf = (number: number) =>
  bundled.references
    .filter((reference) => reference.hymn === number)
    .map((reference) => reference.passage);

/** A word but the line's last ends in a no-break space. */
const spaced = (syllables: Array<string>, last: boolean): PageWord => ({
  syllables: last ? syllables : [...syllables.slice(0, -1), `${syllables.at(-1) ?? ''}\u00A0`],
});

/** A printed line's words, each one syllable. */
const plainLine = (line: string): PageLine => {
  const words = line.split(/ +/).filter((word) => word.length > 0);
  return { text: line, words: words.map((word, w) => spaced([word], w === words.length - 1)) };
};

/** A line's words as the chords split them into syllables. */
const syllableLine = (line: string, words: ReadonlyArray<Word>): PageLine => {
  const kept = words.filter((word) => word.length > 0);
  return {
    text: line,
    words: kept.map((word, w) =>
      spaced(
        word.map((box) => box.text),
        w === kept.length - 1,
      ),
    ),
  };
};

/**
 * The page shown for the route's hymn: `pageAt`'s, with its head line and
 * each part's lines, split into syllables by `chords`, the hymn's shipped
 * chords decoded (none for a hymn they do not hold).
 */
export const shownAt = (
  book: Book,
  number: string,
  chords: (hymn: number) => HymnChords | undefined,
): Page => {
  const hymn = hymnAt(book, number);
  if (hymn === undefined) return missing;
  const page = pageOf(hymn);
  const decoded = chords(hymn.number);
  const sections = decoded === undefined ? [] : sectionsOf(hymn, decoded);
  return {
    ...page,
    head: headLine(hymn.topic, referencesOf(hymn.number)),
    parts: page.parts.map((part, k) => {
      const printed = hymn.sections[k]?.lines ?? [];
      const split = sections[k];
      return {
        ...part,
        lines: printed.map((line, l) => {
          const words = split?._tag === 'Syllables' ? split.lines[l] : undefined;
          return words === undefined ? plainLine(line) : syllableLine(line, words);
        }),
      };
    }),
  };
};
