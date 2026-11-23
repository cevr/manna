/* oxlint-disable effect/noNullish, effect/noTernary, effect/noUnknownParameters -- Exact's data module cannot import effect (docs/exact.md): a route that names no hymn is 0, a source with chords off reads none, and Exact's kept values, which the gate passes over unread, are its own. */

/**
 * The sources that read a hymn's chords, each answered only once that
 * hymn's chords are read (`load.ts`): `hymnPage` (the page's syllables),
 * `chordsPage` with chords on, `keysPage` and `keysStep` (the printed key)
 * and `sheetPlacement` (whether the dial shows). A source asked for a hymn
 * whose chords are here answers at once, as before; one asked for a hymn
 * not yet read answers once the read has settled, so the page shown, its
 * pager's neighbours, the key button and the player sheet are first drawn
 * with the chords, never first without them. A read that fails answers as
 * a hymn with none (its words alone, `none`), and the next ask reads again.
 */

import type { Book } from '../hymns/book.ts';
import { hymnAt } from '../hymn/page.ts';
import type { AppModule, ShippedFiles } from '../shipped/load.ts';
import type { sourcesAt } from '../sources.ts';
import { type ChordsLoader, chordsReader, isHymn } from './load.ts';

/** The chords' readers among the sources `sourcesAt` answers. */
export type ChordsReaders = Pick<
  ReturnType<typeof sourcesAt>,
  'hymnPage' | 'chordsPage' | 'keysPage' | 'keysStep' | 'sheetPlacement'
>;

/** `sources`' chords' readers over `book`, each answering once its hymn's chords are read by `loader`. */
export const chordsFirstUse = (book: Book, loader: ChordsLoader, sources: ChordsReaders) => {
  const numberOf = (route: string): number => hymnAt(book, route)?.number ?? 0;
  const gated =
    <Args, A>(source: (args: Args) => A, hymnOf: (args: Args) => number) =>
    (
      args: Args,
      _store?: unknown,
      storage?: ShippedFiles | null,
      native?: AppModule | null,
    ): A | Promise<Awaited<A>> => {
      const number = hymnOf(args);
      return loader.after(number, isHymn(number), chordsReader(storage, native), () =>
        source(args),
      );
    };
  return {
    hymnPage: gated(sources.hymnPage, ([route]) => numberOf(route)),
    chordsPage: gated(sources.chordsPage, ([route, on]) => (on ? numberOf(route) : 0)),
    keysPage: gated(sources.keysPage, ([route]) => numberOf(route)),
    keysStep: gated(sources.keysStep, ([, , route]) => numberOf(route)),
    sheetPlacement: gated(sources.sheetPlacement, ([number]) => number),
  };
};
