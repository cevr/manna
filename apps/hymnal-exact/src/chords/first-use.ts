/* oxlint-disable effect/noNullish, effect/noTernary, effect/noUnknownParameters -- Exact's data module cannot import effect (docs/exact.md): a route that names no hymn is 0, a source with chords off reads none, and Exact's kept values, which the gate passes over unread, are its own. */

/**
 * The sources that read a hymn's chords, each answered only once that
 * hymn's chords are read (`load.ts`): `hymnPage` (the page's syllables)
 * with chords on, `chordsPage` with chords on, `keysPage` and `keysStep` (the printed key)
 * and `sheetPlacement` (whether the dial shows). A source asked for a hymn
 * whose chords are here answers at once, as before; one asked for a hymn
 * not yet read answers once the read has settled, so the page shown, its
 * pager's neighbours, the key button and the player sheet are first drawn
 * with the chords, never first without them. A read that fails answers as
 * a hymn with none (its words alone, `none`), and the next ask reads again.
 * With chords off a page's words wait for nothing: `hymnPage` answers at
 * once and reads the hymn's chords behind it (the loader's `before`), and
 * the syllables they split its words into (the same words, drawn the same,
 * which follow times by) reach the shown page by `chordsRead`'s `mended`.
 *
 * A source answered without a hymn's chords keeps that answer while its
 * arguments stand, so a pager page asked as a neighbour whose read failed
 * would stay chordless once shown, though a later read of the same file
 * succeeds. `chordsRead` is that later read for the hymn shown: asked at
 * each hymn opened and each turn of chords on or off (its second
 * argument, read for nothing else), it reads that hymn's chords when they are not kept,
 * once more when that read fails, and answers where they stand
 * (`ShippedState`): `mended` (the screen asks the chords' readers again,
 * `chordsMend`), `kept`, `missing`, or `none` for no hymn; at once when
 * the chords are here, else once the reads have settled.
 */

import type { Book } from '../hymns/book.ts';
import { hymnAt } from '../hymn/page.ts';
import type { AppModule, ShippedFiles } from '../shipped/load.ts';
import type { sourcesAt } from '../sources.ts';
import { type ChordsLoader, chordsReader, isHymn } from './load.ts';

/** Where the shown hymn's chords file stands (`chordsRead`). */
export interface ChordsRead {
  readonly number: number;
  readonly state: string;
}

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
  const page = gated(sources.hymnPage, ([route]) => numberOf(route));
  return {
    hymnPage: (
      [route, on]: readonly [string, boolean],
      store?: unknown,
      storage?: ShippedFiles | null,
      native?: AppModule | null,
    ) => {
      if (on) return page([route], store, storage, native);
      const number = numberOf(route);
      if (!isHymn(number)) return sources.hymnPage([route]);
      return loader.before(number, chordsReader(storage, native), () => sources.hymnPage([route]));
    },
    chordsPage: gated(sources.chordsPage, ([route, on]) => (on ? numberOf(route) : 0)),
    keysPage: gated(sources.keysPage, ([route]) => numberOf(route)),
    keysStep: gated(sources.keysStep, ([, , route]) => numberOf(route)),
    sheetPlacement: gated(sources.sheetPlacement, ([number]) => number),
    chordsRead: (
      [route]: readonly [string, boolean],
      _store?: unknown,
      storage?: ShippedFiles | null,
      native?: AppModule | null,
    ): ChordsRead | Promise<ChordsRead> => {
      const number = numberOf(route);
      const here = (): ChordsRead => ({ number, state: loader.stateOf(number) });
      if (!isHymn(number)) return { number, state: 'none' };
      if (loader.kept.has(number)) return here();
      const read = chordsReader(storage, native);
      return loader
        .load(number, read)
        .then(() => (loader.kept.has(number) ? undefined : loader.load(number, read)))
        .then(here);
    },
  };
};
