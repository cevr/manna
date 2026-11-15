/**
 * The home's sources, as `app.ts` registers them. Each answers from its
 * arguments alone: the reader's lists are the view's kept states, passed in,
 * and every answer is a new list or a view of one, so a relaunch, which
 * keeps the states, answers the same.
 *
 * - `listTabs()`: the tabs' names, in their order.
 * - `listTitles()`: every hymn's title, at its number less one.
 * - `listTabRows(name, favourites, recent)`: tab `name`'s groups (`tabGroups`).
 * - `recentAfter(recent, segment)` and `favouritesAfter(favourites, n)`: a list
 *   after a hymn page is shown, or its star pressed.
 * - `recentRows(recent)`: the shelf and the Recent screen.
 * - `listOpening(url, n)`: how a found hymn opens from the screen at `url`.
 */

import bundled from 'virtual:hymnal-indexes';

import type { Book } from '../hymns/book.ts';
import { favouritesAfter, recentAfter, recentView } from './lists.ts';
import { openingMove } from './opening.ts';
import { TAB_NAMES, type TabSource, tabGroups, titlesOf } from './tabs.ts';

/**
 * The home's sources over `book` and the back-matter indexes the build
 * bundles; `tabs` is the current app's `tabsOf`, given so a test can count
 * the tabs computed.
 */
export const homeSources = (
  book: Book,
  indexes: TabSource['indexes'] = bundled,
  tabs?: Parameters<typeof tabGroups>[4],
) => {
  const source: TabSource = { book, indexes };
  return {
    listTabs: () => [...TAB_NAMES],
    listTitles: () => titlesOf(book),
    listTabRows: ([name, favourites, recent]: readonly [
      string,
      ReadonlyArray<number>,
      ReadonlyArray<number>,
    ]) => tabGroups(source, name, favourites, recent, tabs),
    recentAfter: ([recent, segment]: readonly [ReadonlyArray<number>, string]) => ({
      numbers: recentAfter(book, recent, segment),
    }),
    favouritesAfter: ([favourites, n]: readonly [ReadonlyArray<number>, number]) => ({
      numbers: favouritesAfter(book, favourites, n),
    }),
    recentRows: ([recent]: readonly [ReadonlyArray<number>]) => recentView(book, recent),
    listOpening: ([url, n]: readonly [string, number]) => openingMove(url, n),
  };
};
