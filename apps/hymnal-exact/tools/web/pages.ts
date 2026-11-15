/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noThrowStatement, effect/noNewError -- a build-time host script, run after `web-build` by `bun run build:web`: it writes the site's pages beside the shell under Bun, and never runs in the data module. */

/**
 * Writes the site's pages (`src/web/pages.ts` `pagesOf`) into a built
 * folder from its `shell.html`: `bun tools/web/pages.ts [dist]`. A page is
 * written only when its text changes (`writeGenerated`), so a second run
 * over the same build writes nothing; it says how many it wrote.
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { writeGenerated } from '@manna/exact-kit/prepare';
import { readWords } from '@manna/hymnal-app/vite/words';

import { pagesOf } from '../../src/web/pages.ts';

/** Writes every page into `dir`; how many it wrote and how many it left as they were. */
export const writePages = (dir: string) => {
  const shell = join(dir, 'shell.html');
  if (!existsSync(shell)) throw new Error(`pages: no ${shell}: run the web build first`);
  const book = {
    hymns: readWords(),
    index: () => {
      throw new Error('pages ask no search');
    },
  };
  let wrote = 0;
  let kept = 0;
  for (const [file, html] of pagesOf(book, readFileSync(shell, 'utf8'))) {
    const path = join(dir, file);
    mkdirSync(dirname(path), { recursive: true });
    if (writeGenerated(path, html)) wrote += 1;
    else kept += 1;
  }
  return { wrote, kept };
};

if (import.meta.main) {
  const dir = join(process.cwd(), process.argv[2] ?? 'dist');
  const { wrote, kept } = writePages(dir);
  console.log(`[web] pages dir=${dir} wrote=${wrote} kept=${kept}`);
}
