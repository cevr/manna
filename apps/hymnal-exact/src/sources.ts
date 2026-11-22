/**
 * Every source the view asks for, one entry per feature: `app.ts` types
 * them against `app.contract`'s declarations and answers through them, and
 * the Bun tests drive them as Exact's data module runs them. The player's
 * recordings are served from `origin` (held to the bucket or a loopback
 * fixture by `originOf`) and its stanzas timed by `timing` (`app.ts` passes
 * the written `src/player/timing.gen.ts`); the chords are `chords`, one
 * string per hymn (`app.ts` passes the written `src/chords/chords.gen.ts`).
 */

import { abouthymnSources } from './abouthymn/sources.ts';
import { findSources } from './find/sources.ts';
import { homeSources } from './home/sources.ts';
import { chordsSources } from './chords/sources.ts';
import { hymnSources } from './hymn/sources.ts';
import { book } from './hymns/book.ts';
import { listSources } from './list/sources.ts';
import { pagerSources } from './pager/sources.ts';
import { originOf, playerSources } from './player/sources.ts';
import { railSources } from './rail/sources.ts';
import { resultsSources } from './results/sources.ts';
import { settingsSources } from './settings/sources.ts';

export const sourcesAt = (
  origin: string,
  timing: ReadonlyArray<readonly [number, string]>,
  chords: ReadonlyArray<readonly [number, string]> = [],
) => ({
  ...listSources(book),
  ...hymnSources(book, chords),
  ...playerSources(book, timing, originOf(origin)),
  ...homeSources(book),
  ...settingsSources(),
  ...findSources(book),
  ...chordsSources(book, chords),
  ...railSources(book),
  ...abouthymnSources(book),
  ...pagerSources(book),
  ...resultsSources(),
});
