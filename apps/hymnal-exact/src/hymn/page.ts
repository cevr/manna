/**
 * A hymn's page: its number, its title, and its words in the order they are
 * sung, as the current app derives them (`text.ts`): each stanza under its
 * number, and the refrain written out each time it is sung. A part is one
 * text, its lines kept together. Its key and `testId` say which it is:
 * `stanza-<n>` by the stanza's number, `refrain-<k>` by the refrain's
 * place among the refrains sung (the first sung is `refrain-1`).
 */

import type { Book, HymnText, Section } from '../hymns/book.ts';

export interface Part {
  readonly key: string;
  readonly label: string;
  readonly text: string;
}

export interface Page {
  /** The hymn's number; 0 when the hymnal has no hymn of the route's number. */
  readonly number: number;
  readonly title: string;
  /** The hymnal's topical section the hymn is printed in. */
  readonly topic: string;
  readonly parts: Array<Part>;
}

const missing: Page = { number: 0, title: '', topic: '', parts: [] };

const partsOf = (sections: ReadonlyArray<Section>): Array<Part> => {
  let refrains = 0;
  return sections.map((section) => {
    const text = section.lines.join('\n');
    if (section.kind === 'stanza')
      return { key: `stanza-${section.n}`, label: `${section.n}`, text };
    refrains += 1;
    return { key: `refrain-${refrains}`, label: 'Refrain', text };
  });
};

const pageOf = (hymn: HymnText): Page => ({
  number: hymn.number,
  title: hymn.title,
  topic: hymn.topic,
  parts: partsOf(hymn.sections),
});

/** The page of the hymn a route names (`100`, written without leading zeros), or the missing page. */
export const pageAt = (book: Book, number: string): Page => {
  if (!/^[1-9]\d*$/.test(number)) return missing;
  const [page = missing] = book.hymns.filter((hymn) => hymn.number === Number(number)).map(pageOf);
  return page;
};
