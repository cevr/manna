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
  readonly sticky: ReadonlyArray<number>;
}

const none: ReadonlySet<number> = new Set();

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

export const groupRowsOf = <Hymn extends { readonly number: number }>(
  tab: string,
  groups: ReadonlyArray<{ readonly name: string; readonly hymns: ReadonlyArray<number> }>,
  hymns: ReadonlyArray<Hymn>,
  favourites: ReadonlySet<number> = none,
): Rows<Hymn> => {
  const byNumber = new Map(hymns.map((hymn) => [hymn.number, hymn]));
  const source = hymns.map((hymn) => hymn.number).toSorted((a, b) => a - b);
  const rows: Array<Row<Hymn>> = [];
  const sticky: Array<number> = [];
  groups.forEach((group, i) => {
    const found = group.hymns.flatMap((n) =>
      Option.toArray(Option.fromUndefinedOr(byNumber.get(n))),
    );
    if (found.length === 0) return;
    sticky.push(rows.length);
    rows.push({ kind: 'topic', key: `group:${tab}:${i}`, name: group.name });
    for (const hymn of found)
      rows.push({
        kind: 'hymn',
        key: `${tab}:${i}:${hymn.number}`,
        hymn,
        source,
        favourite: favourites.has(hymn.number),
        line: Option.none(),
      });
  });
  return { rows, sticky };
};

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

export const STRONG = 5;

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
