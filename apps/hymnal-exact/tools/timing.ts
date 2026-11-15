/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals -- a build-time host script, run before each Exact command (`src/hymns/make.ts` imports it): it writes the timing module the data module bundles, under Bun, never in the data module. */

/**
 * Writes `src/player/timing.gen.ts` (ignored; `timing.gen.d.ts` declares it):
 * every hymn's timing as the current app bundles it (`vite/timing.ts`, its
 * `virtual:hymnal-timing`), each line kept to its flags, start and length.
 * A line's words are left out: the player reads only when each line starts
 * and ends, to cut the stanzas a reader leaves out (`score.ts`), and the
 * strings stay in the encoding `timelineOf` decodes. Written only when its
 * bytes change, so an unchanged book leaves the build fresh.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { readTiming } from '@manna/hymnal-app/vite/timing';

/** A timing string with each line's words left out: `head|flags,start,length;…`. */
export const linesOnly = (encoded: string): string => {
  const bar = encoded.indexOf('|');
  const lines = encoded
    .slice(bar + 1)
    .split(';')
    .map((line) => line.split(',').slice(0, 3).join(','));
  return `${encoded.slice(0, bar)}|${lines.join(';')}`;
};

const path = new URL('../src/player/timing.gen.ts', import.meta.url).pathname;
const rows = readTiming().map(([number, encoded]) => [number, linesOnly(encoded)] as const);
const text = `/** Every hymn's line timing, written by tools/timing.ts; ignored. */\nexport default ${JSON.stringify(rows)} as ReadonlyArray<readonly [number, string]>;\n`;
if (!existsSync(path) || readFileSync(path, 'utf8') !== text) writeFileSync(path, text);
