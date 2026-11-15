/**
 * The open search's rules, pure, with no atom: `place.ts` holds the app's
 * search atoms and re-exports these, so a host that runs the rules alone
 * (the Exact port) takes no registry.
 */

import { Option } from 'effect';

/**
 * How a screen of the phone is in search mode, or `off` when it is not:
 * `field` after a press on its find bar's `Search` (`FindBar.tsx`), which
 * focuses the box so the keyboard rises for the reader's words, and `about`
 * after `About this hymn` opens it on the home list with a query (a topic or
 * a passage), which leaves the keyboard down over the results the reader
 * came for. Cancel turns it off. The web's home has no mode: its results
 * show while the query has text.
 */
export type SearchMode = 'off' | 'field' | 'about';

/** The one open search: the path of the screen it opened on, and how it opened. */
export interface Searching {
  readonly path: string;
  readonly mode: Exclude<SearchMode, 'off'>;
}

/** Search open on the screen at `path`, opened by `mode`. */
export const searchAt = (path: string, mode: Searching['mode']): Option.Option<Searching> =>
  Option.some({ path, mode });

/** The search mode of the screen at `path`: the open search's mode on its own screen, else `off`. */
export const modeAt = (open: Option.Option<Searching>, path: string): SearchMode =>
  Option.match(
    Option.filter(open, (searching) => searching.path === path),
    { onNone: () => 'off', onSome: ({ mode }) => mode },
  );
