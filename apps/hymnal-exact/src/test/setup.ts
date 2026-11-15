/**
 * The Bun tests' stand-ins for the two modules the build maps (the app's
 * `tsconfig.json`): `virtual:hymnal` and `virtual:hymnal-indexes` are the
 * words and indexes the current app derives (`vite/words.ts`,
 * `vite/indexes.ts`), the same the build writes to `src/hymns/*.gen.json`.
 * They register through the `Bun` global: an `import … from 'bun'` here
 * would make Exact's type check stage `@types/bun`, whose libs lie outside
 * the app.
 */

import { readIndexes } from '@manna/hymnal-app/vite/indexes';
import { readWords } from '@manna/hymnal-app/vite/words';

Bun.plugin({
  name: 'hymnal-exact-book',
  setup(build) {
    build.module('virtual:hymnal', () => ({ exports: { default: readWords() }, loader: 'object' }));
    build.module('virtual:hymnal-indexes', () => ({
      exports: { default: readIndexes() },
      loader: 'object',
    }));
  },
});
