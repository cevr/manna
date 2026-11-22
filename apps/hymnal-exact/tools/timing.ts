/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals -- a build-time host script, run before each Exact command (`src/hymns/make.ts` imports it): it writes the timing module the data module bundles and the per-hymn files the apps ship, under Bun, never in the data module. */

/**
 * Writes the hymns' timing as the current app bundles it (`vite/timing.ts`,
 * its `virtual:hymnal-timing`), in two parts (`src/timing/files.ts`):
 * `src/player/timing.gen.ts` (ignored; `timing.gen.d.ts` declares it), each
 * line kept to its flags, start and length, which the data module bundles
 * because the player reads when each line starts and ends at Play
 * (`score.ts`); and one file a hymn with its words' syllable times kept
 * (`timing/<n>` for iOS, `modules/web/timing/<n>.js` for the web, both
 * ignored), read on first use (`src/timing/load.ts`) and never bundled.
 * Each is written only when its bytes change, so an unchanged book leaves
 * the build fresh.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { readTiming } from '@manna/hymnal-app/vite/timing';

import { linesOnly } from '../src/timing/files.ts';
import { writeTimingFiles } from '../src/timing/write.ts';

const path = new URL('../src/player/timing.gen.ts', import.meta.url).pathname;
const timing = readTiming();
const rows = timing.map(([number, encoded]) => [number, linesOnly(encoded)] as const);
const text = `/** Every hymn's line timing, written by tools/timing.ts; ignored. */\nexport default ${JSON.stringify(rows)} as ReadonlyArray<readonly [number, string]>;\n`;
if (!existsSync(path) || readFileSync(path, 'utf8') !== text) writeFileSync(path, text);
writeTimingFiles(new URL('..', import.meta.url).pathname, timing);
