/* oxlint-disable effect/noTernary, effect/noNullish -- Exact's data module imports no effect (docs/exact.md): a found line's Option is read by its tag, and no favourites is the current app's own default, passed plainly. */

/**
 * What the home list draws for a query: with none, every hymn once in number
 * order, under the hymnal's topical sections (a section is a run of hymns
 * of one topic, and none is empty); with one, the current app's search
 * results as its list draws them (`resultRowsOf`): the hymns its search
 * finds, in its order, each found by a line other than its title carrying
 * that line, and, given hymns `about` the query, the strongest matches
 * first, then the sections `Hymns about this` and `More matches`, each
 * under its name. A row holds a hymn's number, title and found line only,
 * never its words: the list's answer stays small however often a keystroke
 * asks for it.
 */

import { find } from '@manna/hymnal-app/hymns/search';
import { resultRowsOf } from '@manna/hymnal-app/reader/rows';

import type { Book, HymnText } from '../hymns/book.ts';

export interface Row {
  readonly number: number;
  readonly title: string;
  /** The line a search found the hymn by, when not its title; "" with none. */
  readonly line: string;
}

/** A run of rows: a topic's or a result section's, named and keyed by its slug, or a search's strongest matches, with neither. */
export interface RowSection {
  readonly slug: string;
  readonly name: string;
  readonly rows: Array<Row>;
}

/** The key and name of a search's first run, its strongest matches. */
const FOUND = 'found';

/** A topic's name as a key and a `testId`: `Love of God` is `love-of-god`. */
export const slugOf = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const rowOf = (hymn: HymnText, line = ''): Row => ({
  number: hymn.number,
  title: hymn.title,
  line,
});

const sectionsOf = (hymns: ReadonlyArray<HymnText>): Array<RowSection> => {
  const sections: Array<{ slug: string; name: string; rows: Array<Row> }> = [];
  for (const hymn of hymns) {
    const last = sections.at(-1);
    if (last?.name === hymn.topic) last.rows.push(rowOf(hymn));
    else sections.push({ slug: slugOf(hymn.topic), name: hymn.topic, rows: [rowOf(hymn)] });
  }
  return sections;
};

/** The current app's result rows as runs: a topic row starts a named run, and hymn rows before any are the strongest matches'. */
const runsOf = (rows: ReturnType<typeof resultRowsOf<HymnText>>['rows']): Array<RowSection> => {
  const runs: Array<{ slug: string; name: string; rows: Array<Row> }> = [];
  for (const row of rows) {
    if (row.kind === 'topic') runs.push({ slug: slugOf(row.name), name: row.name, rows: [] });
    else if (row.kind === 'hymn') {
      const last = runs.at(-1) ?? { slug: FOUND, name: '', rows: [] };
      if (runs.length === 0) runs.push(last);
      last.rows.push(rowOf(row.hymn, row.line._tag === 'Some' ? row.line.value : ''));
    }
  }
  return runs;
};

/** The sections the list draws for `query`, with the hymns `about` it; none when a query finds nothing. */
export const rowsOf = (
  book: Book,
  query: string,
  about: ReadonlyArray<HymnText> = [],
): Array<RowSection> => {
  if (query.trim() === '') return sectionsOf(book.hymns);
  const found = find(book.index(), query);
  if (found.length === 0) return [];
  const lines = new Map(
    found.flatMap((each) =>
      each.line._tag === 'Some' ? [[each.hymn.number, each.line.value] as const] : [],
    ),
  );
  return runsOf(
    resultRowsOf(
      found.map((each) => each.hymn),
      about,
      undefined,
      lines,
    ).rows,
  );
};
