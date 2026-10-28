/**
 * The phones' hymn list as rows: first each of the reader's own lists that
 * holds a hymn (`shelves`: Recent), under a header row that names it and
 * opens its own screen (`href`); then each run of hymns in one topic, under
 * a row that names the topic.
 * The list pins a topic's row at its top while its hymns scroll under it
 * (`sticky`, the topic rows' indices). A shelf's header is not pinned: the
 * pinned copy lets touches through to the list, so a pinned header could not
 * take a press.
 *
 * A row's place comes from the hymns' own order alone: a topic that comes
 * back after another gets a second row, keyed by its own first hymn. A hymn
 * row carries the hymns a press on it pages through (`source`): every hymn
 * of the list under the topics, in its order, a shelf's rows too (a shelf
 * pages through its own hymns only from its own screen). A hymn row of one of the
 * reader's `favourites` is starred (`favourite`), wherever it shows. A
 * search's result found by a line other than its title carries that line
 * (`line`), which its row shows under the title; every other row has none.
 */

import { Option } from 'effect';

import type { Shelf } from './lists';

export type Row<Hymn> =
  | { readonly kind: 'topic'; readonly key: string; readonly name: string }
  | { readonly kind: 'shelf'; readonly key: string; readonly name: string; readonly href: string }
  | {
      readonly kind: 'hymn';
      readonly key: string;
      readonly hymn: Hymn;
      readonly source: ReadonlyArray<number>;
      readonly favourite: boolean;
      readonly line: Option.Option<string>;
    };

export interface Rows<Hymn> {
  readonly rows: ReadonlyArray<Row<Hymn>>;
  /** The index of every topic row, ascending. */
  readonly sticky: ReadonlyArray<number>;
}

/** No favourites: a list drawn without the reader's lists. */
const none: ReadonlySet<number> = new Set();

/** No found lines: a list that is not a search's results. */
const noLines: ReadonlyMap<number, string> = new Map();

export const rowsOf = <Hymn extends { readonly number: number; readonly topic: string }>(
  hymns: ReadonlyArray<Hymn>,
  shelves: ReadonlyArray<Shelf<Hymn>> = [],
  favourites: ReadonlySet<number> = none,
): Rows<Hymn> => {
  const rows: Array<Row<Hymn>> = [];
  const sticky: Array<number> = [];
  const source = hymns.map((hymn) => hymn.number);
  for (const shelf of shelves.filter((s) => s.hymns.length > 0)) {
    rows.push({ kind: 'shelf', key: `list:${shelf.name}`, name: shelf.name, href: shelf.href });
    for (const hymn of shelf.hymns)
      rows.push({
        kind: 'hymn',
        key: `${shelf.name}:${hymn.number}`,
        hymn,
        source,
        favourite: favourites.has(hymn.number),
        line: Option.none(),
      });
  }
  hymns.forEach((hymn, i) => {
    if (hymns[i - 1]?.topic !== hymn.topic) {
      sticky.push(rows.length);
      rows.push({ kind: 'topic', key: `topic:${hymn.number}`, name: hymn.topic });
    }
    rows.push({
      kind: 'hymn',
      key: `hymn:${hymn.number}`,
      hymn,
      source,
      favourite: favourites.has(hymn.number),
      line: Option.none(),
    });
  });
  return { rows, sticky };
};

/**
 * A list with no topic rows, such as a search's results: a row per hymn,
 * each paging through them all, each carrying the line `lines` gives its
 * hymn (the line a search found it by).
 */
export const plainRowsOf = <Hymn extends { readonly number: number }>(
  hymns: ReadonlyArray<Hymn>,
  favourites: ReadonlySet<number> = none,
  lines: ReadonlyMap<number, string> = noLines,
): Rows<Hymn> => {
  const source = hymns.map((hymn) => hymn.number);
  return {
    rows: hymns.map((hymn): Row<Hymn> => ({
      kind: 'hymn',
      key: `hymn:${hymn.number}`,
      hymn,
      source,
      favourite: favourites.has(hymn.number),
      line: Option.fromUndefinedOr(lines.get(hymn.number)),
    })),
    sticky: [],
  };
};

/** How many of a search's strongest matches stand above `Hymns about this`. */
export const STRONG = 5;

/**
 * A search's results with the hymns about it (`about`, nearest first): the
 * strongest matches, at most `STRONG`, then a section `Hymns about this`
 * holding the hymns about the query that are not among those, then the rest
 * of the matches, but those the section shows, under a section `More
 * matches`. Each hymn shows once, and a section with no hymn has no row.
 * With no hymns about the query the results are `plainRowsOf`'s. Every row
 * pages through the hymns in the order shown.
 */
export const resultRowsOf = <Hymn extends { readonly number: number }>(
  found: ReadonlyArray<Hymn>,
  about: ReadonlyArray<Hymn>,
  favourites: ReadonlySet<number> = none,
  lines: ReadonlyMap<number, string> = noLines,
): Rows<Hymn> => {
  const strong = found.slice(0, STRONG);
  const near = about.filter((hymn) => !strong.some((s) => s.number === hymn.number));
  if (near.length === 0) return plainRowsOf(found, favourites, lines);
  const rest = found.slice(STRONG).filter((hymn) => !near.some((n) => n.number === hymn.number));
  const source = [...strong, ...near, ...rest].map((hymn) => hymn.number);
  const hymnRow = (hymn: Hymn, group: string, line: Option.Option<string>): Row<Hymn> => ({
    kind: 'hymn',
    key: `${group}:${hymn.number}`,
    hymn,
    source,
    favourite: favourites.has(hymn.number),
    line,
  });
  const foundRow = (hymn: Hymn) =>
    hymnRow(hymn, 'hymn', Option.fromUndefinedOr(lines.get(hymn.number)));
  const section = (name: string, hymns: ReadonlyArray<Row<Hymn>>): ReadonlyArray<Row<Hymn>> => {
    if (hymns.length === 0) return [];
    return [{ kind: 'topic', key: `section:${name}`, name }, ...hymns];
  };
  return {
    rows: [
      ...strong.map(foundRow),
      ...section(
        'Hymns about this',
        near.map((hymn) => hymnRow(hymn, 'about', Option.none())),
      ),
      ...section('More matches', rest.map(foundRow)),
    ],
    sticky: [],
  };
};
