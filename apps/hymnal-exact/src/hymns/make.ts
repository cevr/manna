/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals -- a build-time host script, run before each Exact command (`bun run exact`): it writes the book the data module bundles as JSON text, as the current app's bundler plugin does (`vite/hymnal.ts`); it runs under Bun, never in the data module. */

/**
 * The book the data module ships, made from the compiled hymnal by the
 * current app's own derivations: every hymn's words (`words.gen.json`, the
 * current app's `virtual:hymnal`), the back-matter indexes search reads
 * (`indexes.gen.json`, its `virtual:hymnal-indexes`) and every hymn's
 * chords, one string per hymn (`src/chords/chords.gen.ts`, its
 * `virtual:hymnal-chords`, which `app.ts` passes to the chords' sources).
 * The app's `tsconfig.json` maps the two virtual modules to the JSON files,
 * so Exact's bundler takes the current app's search and its hymns
 * unchanged. A file is written only when its bytes change, so an unchanged
 * book leaves the build fresh. None of them is committed.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { readChords } from '@manna/hymnal-app/vite/chords';
import { readIndexes } from '@manna/hymnal-app/vite/indexes';
import { readWords } from '@manna/hymnal-app/vite/words';

import '../abouthymn/make.ts'; // oxlint-disable-line import/no-unassigned-import -- About's More like this is written as this module is imported, before Exact bundles it.
import '../../tools/timing.ts'; // oxlint-disable-line import/no-unassigned-import -- the player's timing is written as this module is imported, before Exact bundles it.

const chords = `/** Every hymn's chords, one string per hymn, written by src/hymns/make.ts; ignored. */\nexport default ${JSON.stringify(readChords())} as ReadonlyArray<readonly [number, string]>;\n`;

const files = [
  ['./words.gen.json', JSON.stringify(readWords())],
  ['./indexes.gen.json', JSON.stringify(readIndexes())],
  ['../chords/chords.gen.ts', chords],
] as const;

for (const [name, text] of files) {
  const path = new URL(name, import.meta.url).pathname;
  if (!existsSync(path) || readFileSync(path, 'utf8') !== text) writeFileSync(path, text);
}
