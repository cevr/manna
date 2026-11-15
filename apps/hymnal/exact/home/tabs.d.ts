/**
 * `src/home/tabs.ts` as Exact's type check reads it (it stages a package's
 * declarations, never its source): the home list's five tabs, each a name
 * and its groups of hymn numbers, made from the book's hymns, the reader's
 * two lists and the back-matter indexes. The indexes are named by the
 * fields the tabs read, so the port can pass the bundled indexes as its
 * build writes them. `test/exact-home-declarations.ts` holds it to the
 * source. These are the tabs' names, in the order the tab row shows them.
 */
export declare const TAB_NAMES: readonly ['Sections', 'Lists', 'Topics', 'Metres', 'Scripture'];

export type TabName = (typeof TAB_NAMES)[number];

/** A named run of hymns in a tab. */
export interface Group {
  readonly name: string;
  readonly hymns: ReadonlyArray<number>;
}

/** A tab: its name and its groups, in the order the list shows them. */
export interface Tab {
  readonly name: TabName;
  readonly groups: ReadonlyArray<Group>;
}

/** The back-matter indexes, by the fields the tabs read. */
export interface TabIndexes {
  readonly topics: ReadonlyArray<{ readonly name: string; readonly hymns: ReadonlyArray<number> }>;
  readonly references: ReadonlyArray<{
    readonly hymn: number;
    readonly passage: { readonly book: number };
  }>;
  readonly metres: ReadonlyArray<{
    readonly metre: string;
    readonly tunes: ReadonlyArray<{ readonly hymns: ReadonlyArray<number> }>;
  }>;
}

/** What the tabs are made of: every hymn with its section, the reader's favourites (any order) and recent hymns (newest first). */
export interface TabsInput {
  readonly hymns: ReadonlyArray<{ readonly number: number; readonly topic: string }>;
  readonly favourites: ReadonlyArray<number>;
  readonly recent: ReadonlyArray<number>;
  readonly indexes: TabIndexes;
}

/** The tabs in their order; a tab read from an index with no group is left out. */
export declare const tabsOf: (input: TabsInput) => ReadonlyArray<Tab>;
