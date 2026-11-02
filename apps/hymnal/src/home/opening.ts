/**
 * How a hymn chosen with the `#` drums' `Open` or from a search's result
 * opens, by the path of the screen it was chosen on (owner, 2026-11-01).
 * On a hymn page it takes the page's place (`replace`), so Back returns to
 * the screen under the page, never to the hymn just left; the hymn the page
 * already shows `stay`s, and nothing moves (One's replace of a route by the
 * same route and params resets the whole stack). On every other screen it is
 * pushed over that screen (`push`).
 */

import { Option } from 'effect';

/** A chosen hymn's opening: pushed over the screen, in place of the page, or not moved at all. */
export type Opening = 'push' | 'replace' | 'stay';

/**
 * The hymn route's segment in `path`, a path as `usePathname` gives it: its
 * last two segments are `hymns/<n>`, read past a query, a hash, a trailing
 * slash and any base before them.
 */
const hymnSegment = (path: string): Option.Option<string> => {
  const segments = (path.split(/[?#]/)[0] ?? '').split('/').filter((segment) => segment !== '');
  const [route, segment] = segments.slice(-2);
  return Option.filter(Option.fromNullishOr(segment), () => route === 'hymns');
};

/** How hymn `number`, chosen on the screen at `path`, opens. */
export const openingAt = (path: string, number: number): Opening =>
  Option.match(hymnSegment(path), {
    onNone: () => 'push',
    onSome: (segment) => {
      if (segment === String(number)) return 'stay';
      return 'replace';
    },
  });
