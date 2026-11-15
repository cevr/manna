/**
 * Every source the view asks for, one entry per feature: `app.ts` types
 * them against `app.contract`'s declarations and answers through them, and
 * the Bun tests drive them as Exact's data module runs them. The player's
 * recordings are served from `origin` (held to the bucket or a loopback
 * fixture by `originOf`) and its stanzas timed by `timing` (`app.ts` passes
 * the written `src/player/timing.gen.ts`).
 */

import { homeSources } from './home/sources.ts';
import { hymnSources } from './hymn/sources.ts';
import { book } from './hymns/book.ts';
import { listSources } from './list/sources.ts';
import { originOf, playerSources } from './player/sources.ts';
import { settingsSources } from './settings/sources.ts';

export const sourcesAt = (origin: string, timing: ReadonlyArray<readonly [number, string]>) => ({
  ...listSources(book),
  ...hymnSources(book),
  ...playerSources(book, timing, originOf(origin)),
  ...homeSources(book),
  ...settingsSources(),
});
