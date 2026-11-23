/* oxlint-disable effect/noTernary, effect/noNullish -- Exact's data module cannot import effect (docs/exact.md): a file whose text the current app cannot decode is refused plainly as undefined, and a read has no files or module where the host gives none. */

/**
 * Each hymn's chords, one string per hymn in the current app's encoding
 * (`vite/chords.ts`, decoded by its `decodeHymn`), shipped as a file a hymn
 * (`chords/<n>` for iOS, `modules/web/chords/<n>.js` for the web; written by
 * `src/hymns/make.ts`) and read the first time a source needs that hymn's
 * (`src/shipped/load.ts`), never bundled: the hymn page, its pager's
 * neighbours, the key button and the player sheet's placement dial answer
 * once their hymn's file is read. A file the current app cannot decode is
 * kept as nothing, so the hymn shows its words alone and is read again
 * when next asked.
 */

import { decodeHymn } from '@manna/hymnal-app/hymns/chords';

import { readerOf, type AppModule, type ShippedFiles, shippedLoader } from '../shipped/load.ts';

/** The shipped folder of the chords. */
export const CHORDS = 'chords';

/** The loader over the chords `given` from the start (a test's; none in the app), by hymn number. */
export const chordsLoader = (given: ReadonlyMap<number, string> = new Map()) =>
  shippedLoader<number, string>(given, String, (text) =>
    decodeHymn(text)._tag === 'Some' ? text : undefined,
  );

export type ChordsLoader = ReturnType<typeof chordsLoader>;

/** The read a source makes of a hymn's chords, through its `storage` and `native`. */
export const chordsReader = (storage?: ShippedFiles | null, native?: AppModule | null) =>
  readerOf(CHORDS, storage, native);

/** Whether `number` names a hymn whose chords a source may need to read. */
export const isHymn = (number: number): boolean => Number.isInteger(number) && number > 0;
