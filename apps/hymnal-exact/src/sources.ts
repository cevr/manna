/**
 * Every source the view asks for, one entry per feature: `app.ts` types
 * them against `app.contract`'s declarations and answers through them, and
 * the Bun tests drive them as Exact's data module runs them. The player's
 * recordings are served from `origin` (held to the bucket or a loopback
 * fixture by `originOf`) and its stanzas timed by `timing` (`app.ts` passes
 * the written `src/player/timing.gen.ts`); the chords are `chords`, one
 * string per hymn by number (`app.ts` passes its loader's, which reads each
 * hymn's the first time a source needs them, `src/chords/first-use.ts`; a
 * test passes what the build ships); `nearest` is each hymn's More like this (the written
 * `src/abouthymn/nearest.gen.ts`); `book` is the hymnal over its back-matter
 * indexes (`app.ts` passes the book over its indexes' loader, read the first
 * time a source needs them, `src/indexes/first-use.ts`; a test passes the
 * book over what the build ships, or none). The player and Downloads share one store
 * of saved recordings (`src/offline/sources.ts`), and the follow and the
 * timing's source one loader of the hymns' words' times (`src/timing/`).
 */

import { abouthymnSources } from './abouthymn/sources.ts';
import { findSources } from './find/sources.ts';
import { homeSources } from './home/sources.ts';
import { chordsSources } from './chords/sources.ts';
import { hymnSources } from './hymn/sources.ts';
import { keysSources } from './keys/sources.ts';
import { type Book, bookOf } from './hymns/book.ts';
import { NO_INDEXES } from './indexes/load.ts';
import { listSources } from './list/sources.ts';
import { offlineSources } from './offline/sources.ts';
import { pagerSources } from './pager/sources.ts';
import { pinchSources } from './pinch/sources.ts';
import { BUCKET, originOf, playerSources } from './player/sources.ts';
import { railSources } from './rail/sources.ts';
import { resultsSources } from './results/sources.ts';
import { settingsSources } from './settings/sources.ts';
import { readingSources } from './reading/sources.ts';
import { feelSources } from './feel/cues.ts';
import { sheetSources } from './sheet/sources.ts';
import { followSources } from './follow/sources.ts';
import { timingLoader } from './timing/load.ts';
import { timingSources } from './timing/sources.ts';

export const sourcesAt = (
  origin: string,
  timing: ReadonlyArray<readonly [number, string]>,
  chords: ReadonlyMap<number, string> = new Map(),
  nearest: ReadonlyArray<readonly [number, ReadonlyArray<number>]> = [],
  book: Book = bookOf(() => NO_INDEXES),
) => {
  const recordings = originOf(origin);
  const saved = offlineSources(recordings, recordings !== BUCKET, timing);
  const words = timingLoader(new Map(timing));
  return {
    ...listSources(book),
    ...hymnSources(book, chords),
    ...playerSources(book, timing, recordings, saved.offline),
    ...saved.sources,
    ...homeSources(book),
    ...settingsSources(),
    ...findSources(book),
    ...chordsSources(book, chords),
    ...keysSources(book, chords),
    ...railSources(book),
    ...abouthymnSources(book, nearest),
    ...pagerSources(book),
    ...resultsSources(),
    ...sheetSources(chords),
    ...readingSources(),
    ...feelSources(),
    ...pinchSources(),
    ...followSources(book, timing, words.words),
    ...timingSources(words),
  };
};
