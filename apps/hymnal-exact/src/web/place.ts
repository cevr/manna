/* oxlint-disable effect/noTernary, effect/noNullish -- the port's source folder imports no effect (docs/exact.md): an address's path is a plain branch, and an absent segment `undefined`. */

/**
 * The address rule: what screen an address opens on the web, as Exact's
 * router reads it at the pin (`host/web-js/route-pattern.js`, `canonical`
 * and `matchPattern`) over `app.contract`'s route table. The fragment and
 * the query are not the path's; surrounding spaces and control characters
 * are dropped and tabs and line breaks inside it removed; `.` and `..`
 * segments (plain or escaped) are resolved; a path that ends in `/`, but
 * for `/` itself, matches no route; a literal segment matches only as
 * written. A hymn's segment is decoded, and names a hymn only in the form
 * the current app's pages take (`hymnParams`: the number as `String` writes
 * it, `100`, never `0100`) and only for a hymn the book holds, as the hymn
 * page's own rule (`pageAt`) answers; any other address is not found.
 */

import { pageAt } from '../hymn/page.ts';
import type { Book } from '../hymns/book.ts';

export type Place =
  | { readonly screen: 'list' }
  | { readonly screen: 'recent' }
  | { readonly screen: 'player' }
  | { readonly screen: 'hymn'; readonly number: number }
  | { readonly screen: 'notfound' };

/** The route of `app.contract` that draws each screen; the not-found screen is its bare `notfound` row. */
export const ROUTE_OF: Readonly<Record<Place['screen'], string>> = {
  list: 'list',
  recent: 'recent',
  player: 'player',
  hymn: 'hymn',
  notfound: 'notfound',
};

const DOT = new Set(['.', '%2e']);
const DOTS = new Set(['..', '.%2e', '%2e.', '%2e%2e']);

/** `s` with every well-formed `%xx` escape read as UTF-8, a malformed one kept as written. */
const decoded = (s: string): string => {
  const bytes: Array<number> = [];
  const utf8 = new TextEncoder();
  for (let i = 0; i < s.length; i += 1) {
    const hex = s.slice(i + 1, i + 3);
    if (s[i] === '%' && /^[0-9a-f]{2}$/iu.test(hex)) {
      bytes.push(Number.parseInt(hex, 16));
      i += 2;
    } else bytes.push(...utf8.encode(s.charAt(i)));
  }
  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(new Uint8Array(bytes));
};

/** The path's segments after the leading `/`, with dot segments resolved as a browser and Exact's router resolve them. */
const segmentsOf = (path: string): Array<string> => {
  const parts = path.replace(/\\/gu, '/').replace(/^\//u, '').split('/');
  const kept: Array<string> = [];
  for (const [i, segment] of parts.entries()) {
    const lower = segment.toLowerCase();
    if (DOTS.has(lower)) kept.pop();
    if (!DOT.has(lower) && !DOTS.has(lower)) kept.push(segment);
    else if (i === parts.length - 1) kept.push('');
  }
  return kept;
};

/** The screen `location` (a path, with any query and fragment) opens, for the hymns `book` holds. */
export const placeOf = (book: Book, location: string): Place => {
  const cleaned = location.replace(/^[\0- ]+|[\0- ]+$/gu, '').replace(/[\t\n\r]/gu, '');
  const [path = ''] =
    (cleaned.startsWith('/') ? cleaned : `/${cleaned}`).split('#')[0]?.split('?') ?? [];
  const segments = segmentsOf(path);
  const joined = segments.join('/');
  if (joined === '') return { screen: 'list' };
  if (joined === 'recent') return { screen: 'recent' };
  if (joined === 'player') return { screen: 'player' };
  const [first, second, ...rest] = segments;
  if (first !== 'hymns' || second === undefined || second === '' || rest.length > 0)
    return { screen: 'notfound' };
  const number = pageAt(book, decoded(second)).number;
  return number === 0 ? { screen: 'notfound' } : { screen: 'hymn', number };
};

/** Every hymn's address segment, in the book's order: the pages a static build makes for the hymn route. */
export const hymnPages = (book: Book): Array<string> => book.hymns.map((hymn) => `${hymn.number}`);
