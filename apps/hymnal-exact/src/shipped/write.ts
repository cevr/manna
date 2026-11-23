/* oxlint-disable effect/noNodeBuiltinImport -- a build-time host script's part (`src/hymns/make.ts` runs it before each Exact command, and the shipped files' test into a scratch folder): it writes files under Bun, never in the data module. */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Writes `files` (each a path under the app's folder `root` and its text),
 * each only when its text changes, so an unchanged book leaves the build
 * fresh. Answers how many it wrote.
 */
export const writeShipped = (
  root: string,
  files: ReadonlyArray<readonly [string, string]>,
): number => {
  let wrote = 0;
  const made = new Set<string>();
  for (const [name, text] of files) {
    const path = join(root, name);
    if (existsSync(path) && readFileSync(path, 'utf8') === text) continue;
    const folder = dirname(path);
    if (!made.has(folder)) mkdirSync(folder, { recursive: true });
    made.add(folder);
    writeFileSync(path, text);
    wrote += 1;
  }
  return wrote;
};
