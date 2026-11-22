/* oxlint-disable effect/noNodeBuiltinImport -- a build-time host script's part (`tools/timing.ts` runs it before each Exact command, and the timing test into a scratch folder): it writes files under Bun, never in the data module. */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { timingFiles } from './files.ts';

/**
 * Writes each hymn's timing files (`timingFiles`) under the app's folder
 * `root`, each only when its text changes, so an unchanged book leaves the
 * build fresh. Answers how many it wrote.
 */
export const writeTimingFiles = (
  root: string,
  rows: ReadonlyArray<readonly [number, string]>,
): number => {
  let wrote = 0;
  for (const [name, text] of timingFiles(rows)) {
    const path = join(root, name);
    if (existsSync(path) && readFileSync(path, 'utf8') === text) continue;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
    wrote += 1;
  }
  return wrote;
};
