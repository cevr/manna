/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals -- a build-time host script, run before each Exact command (`bun run exact`): it writes the book the data module bundles as JSON text, as the current app's bundler plugin does (`vite/hymnal.ts`); it runs under Bun, never in the data module. */

/**
 * The book the data module ships, made from the compiled hymnal by the
 * current app's own derivations: every hymn's words (`words.gen.json`, the
 * current app's `virtual:hymnal`), the back-matter indexes (`indexes.gen.json`,
 * its `virtual:hymnal-indexes`, which the tests read, and the file the apps
 * ship, read the first time a source needs them, `src/indexes/load.ts`),
 * and every hymn's
 * chords, one string per hymn (its `virtual:hymnal-chords`), as the files
 * the apps ship and the chords' sources read on first use
 * (`src/chords/load.ts`, written by `src/shipped/files.ts`), never bundled.
 * The app's `tsconfig.json` maps the two virtual modules to the JSON files,
 * so Exact's bundler takes the current app's hymns unchanged; the app's
 * modules import no indexes (`src/shipped/no-chords.test.ts`). A file is written only when its bytes change, so an unchanged
 * book leaves the build fresh. None of them is committed.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { readChords } from '@manna/hymnal-app/vite/chords';
import { readIndexes } from '@manna/hymnal-app/vite/indexes';
import { readWords } from '@manna/hymnal-app/vite/words';

import { CHORDS } from '../chords/load.ts';
import { ALL, INDEXES } from '../indexes/load.ts';
import { shippedFiles } from '../shipped/files.ts';
import { writeShipped } from '../shipped/write.ts';

import '../abouthymn/make.ts'; // oxlint-disable-line import/no-unassigned-import -- About's More like this is written as this module is imported, before Exact bundles it.
import '../../tools/timing.ts'; // oxlint-disable-line import/no-unassigned-import -- the player's timing is written as this module is imported, before Exact bundles it.
import '../results/meaning-files.ts'; // oxlint-disable-line import/no-unassigned-import -- the meaning table's files the iOS app ships are written as this module is imported.

const indexes = JSON.stringify(readIndexes());
const files = [
  ['./words.gen.json', JSON.stringify(readWords())],
  ['./indexes.gen.json', indexes],
] as const;

for (const [name, text] of files) {
  const path = new URL(name, import.meta.url).pathname;
  if (!existsSync(path) || readFileSync(path, 'utf8') !== text) writeFileSync(path, text);
}

writeShipped(new URL('../..', import.meta.url).pathname, [
  ...shippedFiles(
    CHORDS,
    readChords().map(([number, text]) => [`${number}`, text] as const),
  ),
  ...shippedFiles(INDEXES, [[ALL, indexes]]),
]);
