/* oxlint-disable effect/noUnknownParameters, effect/noNullish -- Exact's data module cannot import effect (docs/exact.md): Exact's kept values, which the gate passes on unread, are its own, and a host with no files or module gives none. */

/**
 * The sources that read the back-matter indexes, each answered only once
 * they are read (`load.ts`): `hymnRows` for a query (the search reads the
 * Scriptural and Topical indexes), `listTabRows`, `findGroupTiles`,
 * `findTileAt` and `findFollowRow` for the Topics, Scripture and Metres
 * tabs, and `abouthymnPage`. Neither the launch nor a hymn page asks any
 * of these (a page's head line is bundled, `src/hymn/heads.ts`), so they
 * read no indexes; the first that is asked reads them, once, and answers
 * after, so none is first drawn without them. A read that fails answers as
 * with no indexes, and the next ask reads again. Each source is handed the
 * host's arguments whole, so it reads through the host it was asked by.
 */

import { readsIndexes } from '../home/tabs.ts';
import type { AppModule, ShippedFiles } from '../shipped/load.ts';
import { ALL, type IndexesLoader, indexesReader } from './load.ts';

/** A source as Exact calls it: its arguments, then the store, the files and the app's module. */
type Source<Args, A> = (
  args: Args,
  store?: unknown,
  storage?: ShippedFiles | null,
  native?: AppModule | null,
) => A;

/** A source's arguments, of which the gate reads the first: a query, a tab's name or a route. */
type Led = readonly [string, ...Array<unknown>];

/**
 * The indexes' readers, by name, as the sources answer them; each is a
 * method, so a source's own narrower arguments are taken as they are.
 */
export interface IndexesReaders<R, L, G, T, F, B> {
  hymnRows(...call: Parameters<Source<Led, R>>): R;
  listTabRows(...call: Parameters<Source<Led, L>>): L;
  findGroupTiles(...call: Parameters<Source<Led, G>>): G;
  findTileAt(...call: Parameters<Source<Led, T>>): T;
  findFollowRow(...call: Parameters<Source<Led, F>>): F;
  abouthymnPage(...call: Parameters<Source<Led, B>>): B;
}

/** `sources`' indexes' readers, each answering once the indexes are read by `loader`. */
export const indexesFirstUse = <R, L, G, T, F, B>(
  loader: IndexesLoader,
  sources: IndexesReaders<R, L, G, T, F, B>,
) => {
  const gated =
    <Args, A>(source: Source<Args, A>, wanted: (args: Args) => boolean) =>
    (
      args: Args,
      store?: unknown,
      storage?: ShippedFiles | null,
      native?: AppModule | null,
    ): A | Promise<Awaited<A>> =>
      loader.after(ALL, wanted(args), indexesReader(storage, native), () =>
        source(args, store, storage, native),
      );
  const named = ([route]: Led): boolean => route.trim() !== '';
  const tab = ([name]: Led): boolean => readsIndexes(name);
  return {
    hymnRows: gated(sources.hymnRows, named),
    listTabRows: gated(sources.listTabRows, tab),
    findGroupTiles: gated(sources.findGroupTiles, tab),
    findTileAt: gated(sources.findTileAt, tab),
    findFollowRow: gated(sources.findFollowRow, tab),
    abouthymnPage: gated(sources.abouthymnPage, named),
  };
};
