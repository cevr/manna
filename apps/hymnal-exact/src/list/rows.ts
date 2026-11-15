/**
 * What the home list draws for a query: with none, every hymn once in number
 * order, under the hymnal's topical sections (a section is a run of hymns
 * of one topic, and none is empty); with one, the hymns the current app's
 * search finds, in its order, under no header. A row holds a hymn's number
 * and title only, never its words: the list's answer stays small however
 * often a keystroke asks for it.
 */

import { find } from '@manna/hymnal-app/hymns/search';

import type { Book, HymnText } from '../hymns/book.ts';

export interface Row {
  readonly number: number;
  readonly title: string;
}

/** A run of rows: a topic's, named and keyed by its slug, or a search's, with neither. */
export interface RowSection {
  readonly slug: string;
  readonly name: string;
  readonly rows: Array<Row>;
}

/** A topic's name as a key and a `testId`: `Love of God` is `love-of-god`. */
export const slugOf = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const rowOf = (hymn: HymnText): Row => ({ number: hymn.number, title: hymn.title });

const sectionsOf = (hymns: ReadonlyArray<HymnText>): Array<RowSection> => {
  const sections: Array<{ slug: string; name: string; rows: Array<Row> }> = [];
  for (const hymn of hymns) {
    const last = sections.at(-1);
    if (last?.name === hymn.topic) last.rows.push(rowOf(hymn));
    else sections.push({ slug: slugOf(hymn.topic), name: hymn.topic, rows: [rowOf(hymn)] });
  }
  return sections;
};

/** The sections the list draws for `query`; none when a query finds nothing. */
export const rowsOf = (book: Book, query: string): Array<RowSection> => {
  if (query.trim() === '') return sectionsOf(book.hymns);
  const rows = find(book.index(), query).map((found) => rowOf(found.hymn));
  if (rows.length === 0) return [];
  return [{ slug: 'found', name: '', rows }];
};
