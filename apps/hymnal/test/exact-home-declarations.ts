/**
 * The home's declarations in `exact/` that the Exact port reads in place of
 * this app's sources (`package.json`'s `types` conditions) stay true to
 * them: each source export is assigned to its declaration, so the type
 * check of `tsconfig.test.json` fails the day a source's signature drifts
 * from what the port was told. `tabsOf`'s indexes are declared by the
 * fields it reads, so the port can pass its bundled JSON: the source's
 * indexes are held to fit that declaration, and the rest of its input and
 * its answer to the declaration's. Nothing here runs.
 */

import type * as Opening from '../exact/home/opening';
import type * as Tabs from '../exact/home/tabs';
import type * as Lists from '../exact/reader/lists';
import * as opening from '../src/home/opening';
import * as tabs from '../src/home/tabs';
import * as lists from '../src/reader/lists';

/** `A`, which must be assignable to `B`. */
type Fits<A extends B, B> = A;

type Source = Parameters<typeof tabs.tabsOf>[0];

/** The indexes the source reads fit the declared indexes the port passes. */
export type IndexesHeld = Fits<Source['indexes'], Tabs.TabIndexes>;

/** The declared input, but for its indexes, is the source's. */
type Declared = Omit<Tabs.TabsInput, 'indexes'> & Pick<Source, 'indexes'>;

export const held = {
  tabs: {
    TAB_NAMES: tabs.TAB_NAMES satisfies typeof Tabs.TAB_NAMES,
    tabsOf: tabs.tabsOf satisfies (input: Declared) => ReturnType<typeof Tabs.tabsOf>,
    tilesFor: tabs.tilesFor satisfies typeof Tabs.tilesFor,
    tileCount: tabs.tileCount satisfies typeof Tabs.tileCount,
    tileName: tabs.tileName satisfies typeof Tabs.tileName,
  },
  opening: { openingAt: opening.openingAt } satisfies typeof Opening,
  lists: {
    RECENT: lists.RECENT,
    RECENT_SHOWN: lists.RECENT_SHOWN,
    toggleFavourite: lists.toggleFavourite,
    visited: lists.visited,
  } satisfies typeof Lists,
};
