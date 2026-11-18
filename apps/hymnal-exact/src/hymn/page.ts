/* oxlint-disable effect/noNullish, effect/noTernary -- Exact's data module cannot import effect (docs/exact.md): a hymn the shipped chords do not hold is undefined, and the rules branch plainly. */

/**
 * A hymn's page: its number, its title, and its words in the order they are
 * sung, as the current app derives them (`text.ts`): each stanza under its
 * number, and the refrain written out each time it is sung. A part is one
 * text, its lines kept together. Its key and `testId` say which it is:
 * `stanza-<n>` by the stanza's number, `refrain-<k>` by the refrain's
 * place among the refrains sung (the first sung is `refrain-1`).
 *
 * The page shown (`shownAt`) adds what the current app draws over and in
 * it: the quiet head line (`headLine`, the section and its passages) and
 * each printed line as its words, each word as its syllables, from the
 * hymn's shipped chords as the current app reads them (`sectionsOf`), with
 * chords on or off; a part the chords do not split, or a hymn they do not
 * hold, is its words, each one syllable. A word but the line's last ends
 * in a no-break space, as the current app's words do (`SyllableWords.tsx`).
 */

import type { HymnChords, Word } from '@manna/hymnal-app/hymns/chords';
import { sectionsOf } from '@manna/hymnal-app/hymns/chords';
import { referencesOf } from '@manna/hymnal-app/hymns/indexes';
import { headLine } from '@manna/hymnal-app/reader/head-line';

import type { Book, HymnText, Section } from '../hymns/book.ts';

/** A word: its syllables in order, drawn with a hyphen between two. */
export interface PageWord {
  readonly syllables: Array<string>;
}

/** A printed line: its words as printed (what a screen reader reads), and as syllables. */
export interface PageLine {
  readonly text: string;
  readonly words: Array<PageWord>;
}

export interface Part {
  readonly key: string;
  readonly label: string;
  readonly text: string;
  /** Whether the part is the refrain, drawn set in and sloped. */
  readonly refrain: boolean;
  /** Its lines, on the page shown; none on the page `pageAt` answers. */
  readonly lines: Array<PageLine>;
}

export interface Page {
  /** The hymn's number; 0 when the hymnal has no hymn of the route's number. */
  readonly number: number;
  readonly title: string;
  /** The hymnal's topical section the hymn is printed in. */
  readonly topic: string;
  /** The quiet head line, on the page shown: the section and its passages. */
  readonly head: string;
  readonly parts: Array<Part>;
}

const missing: Page = { number: 0, title: '', topic: '', head: '', parts: [] };

const partsOf = (sections: ReadonlyArray<Section>): Array<Part> => {
  let refrains = 0;
  return sections.map((section) => {
    const text = section.lines.join('\n');
    if (section.kind === 'stanza')
      return { key: `stanza-${section.n}`, label: `${section.n}`, text, refrain: false, lines: [] };
    refrains += 1;
    return { key: `refrain-${refrains}`, label: 'Refrain', text, refrain: true, lines: [] };
  });
};

const pageOf = (hymn: HymnText): Page => ({
  number: hymn.number,
  title: hymn.title,
  topic: hymn.topic,
  head: '',
  parts: partsOf(hymn.sections),
});

const hymnAt = (book: Book, number: string): HymnText | undefined => {
  if (!/^[1-9]\d*$/.test(number)) return undefined;
  const [hymn] = book.hymns.filter((each) => each.number === Number(number));
  return hymn;
};

/** The page of the hymn a route names (`100`, written without leading zeros), or the missing page. */
export const pageAt = (book: Book, number: string): Page => {
  const hymn = hymnAt(book, number);
  return hymn === undefined ? missing : pageOf(hymn);
};

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
