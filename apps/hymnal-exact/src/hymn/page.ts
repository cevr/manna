/* oxlint-disable effect/noNullish, effect/noTernary -- Exact's data module cannot import effect (docs/exact.md): a route that names no hymn is undefined, and the rules branch plainly. */

/**
 * A hymn's page: its number, its title, and its words in the order they are
 * sung, as the current app derives them (`text.ts`): each stanza under its
 * number, and the refrain written out each time it is sung. A part is one
 * text, its lines kept together. Its key and `testId` say which it is:
 * `stanza-<n>` by the stanza's number, `refrain-<k>` by the refrain's
 * place among the refrains sung (the first sung is `refrain-1`). The page
 * shown adds its head line and lines (`shown.ts`).
 */

import type { Book, HymnText, Section } from '../hymns/book.ts';

/** A word: its syllables in order, drawn with a hyphen between two, and its first syllable's place in its line from 0 (the follow's mark). */
export interface PageWord {
  readonly syllables: Array<string>;
  readonly start: number;
}

/**
 * A printed line: its words as printed (what a screen reader reads), and as
 * syllables; its place among the hymn's sung lines from 0 (the follow's
 * line, as the current `SyllableLine`'s `index`); and whether it is drawn
 * by its syllables (`timed`), which alone light one by one: a line drawn
 * as words lights only whole, as the current `HangingLine`.
 */
export interface PageLine {
  readonly text: string;
  readonly words: Array<PageWord>;
  readonly at: number;
  readonly timed: boolean;
}

export interface Part {
  readonly key: string;
  readonly label: string;
  readonly text: string;
  /** Whether the part is the refrain, drawn set in and sloped. */
  readonly refrain: boolean;
  /** Its first line's place among the hymn's sung lines, from 0. */
  readonly first: number;
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

/** The page of a route that names no hymn. */
export const missing: Page = { number: 0, title: '', topic: '', head: '', parts: [] };

const partsOf = (sections: ReadonlyArray<Section>): Array<Part> => {
  let refrains = 0;
  let sung = 0;
  return sections.map((section) => {
    const text = section.lines.join('\n');
    const first = sung;
    sung += section.lines.length;
    if (section.kind === 'stanza')
      return {
        key: `stanza-${section.n}`,
        label: `${section.n}`,
        text,
        refrain: false,
        first,
        lines: [],
      };
    refrains += 1;
    return { key: `refrain-${refrains}`, label: 'Refrain', text, refrain: true, first, lines: [] };
  });
};

/** A hymn's page, with no head line and no lines. */
export const pageOf = (hymn: HymnText): Page => ({
  number: hymn.number,
  title: hymn.title,
  topic: hymn.topic,
  head: '',
  parts: partsOf(hymn.sections),
});

/** The hymn a route names (`100`, written without leading zeros), if the hymnal has it. */
export const hymnAt = (book: Book, number: string): HymnText | undefined => {
  if (!/^[1-9]\d*$/.test(number)) return undefined;
  const [hymn] = book.hymns.filter((each) => each.number === Number(number));
  return hymn;
};

/** The page of the hymn a route names, or the missing page. */
export const pageAt = (book: Book, number: string): Page => {
  const hymn = hymnAt(book, number);
  return hymn === undefined ? missing : pageOf(hymn);
};
