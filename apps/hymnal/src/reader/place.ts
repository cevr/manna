/**
 * Where the reader left each list: the search's query and each list's scroll
 * offset, kept in the app's registry for as long as the app runs. On the web
 * a screen is mounted anew when the reader comes back to it (the browser's
 * Back rebuilds every route from the history entry, and a tab or a pushed
 * hymn shows in its screen's place), so a screen reads its place from here,
 * never from its own state.
 */

import { Option } from 'effect';
import * as Atom from 'effect/reactivity/Atom';

import type { Searching } from './search-mode';

export { modeAt, searchAt, type SearchMode, type Searching } from './search-mode';

/** The search field's text. */
export const searchQuery = Atom.make('').pipe(Atom.keepAlive);

/**
 * The open search, if one is open. It belongs to the screen it opened on
 * (`Searching.path`): only that screen's find bar is open and only that
 * screen lies under the results (`StackBottom.tsx`). A hymn pushed from the
 * results (a search on the home list) leaves it open beneath, so Back returns
 * to the results; on a hymn page a result takes the page's place, or is the
 * page's own hymn, and the search closes (`openingAt`, `Search.tsx`). There is
 * one search at a time: `Search` pressed on another screen moves it there.
 */
export const searchOpen = Atom.make(Option.none<Searching>()).pipe(Atom.keepAlive);

/** The Hymns list's scroll offset, in points from its top. */
export const hymnsOffset = Atom.make(0).pipe(Atom.keepAlive);

/** The search results' scroll offset, in points from their top. */
export const searchOffset = Atom.make(0).pipe(Atom.keepAlive);

/** The Recent screen's scroll offset, in points from its top. */
export const recentOffset = Atom.make(0).pipe(Atom.keepAlive);

/**
 * The hymns the pager swipes through next (`pager.ts`): the list a row was
 * pressed in (the home list, its Recent rows too, a search's results or the
 * Recent screen), in its order, as that row's press records it. The hymn screen takes it once,
 * as it opens, and clears it, so a hymn opened any other way (a deep link)
 * pages through every hymn.
 */
export const pagesFrom = Atom.make(Option.none<ReadonlyArray<number>>()).pipe(Atom.keepAlive);

/**
 * The topic a tap in `About this hymn` asks the phone's home list to show:
 * the list takes it once (`Home.native.tsx`), opens its `Topics` tab with
 * that topic's row at the top, and clears it. The web's home has no tabs and
 * never reads it.
 */
export const openAtTopic = Atom.make(Option.none<string>()).pipe(Atom.keepAlive);
