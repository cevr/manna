/**
 * The Bun tests' preload: the current Heartseed's `virtual:heartseed-kjv`,
 * which its lists and passages read through `src/kjv.ts`, is the whole KJV
 * the port ships (`kjv.ts`: the current app's own deriver), as Exact's
 * bundle has it through `tsconfig.json`, behind a counter of the chapters
 * read. So the tests import the current app's modules unchanged, and pass
 * with the written corpus absent.
 */

import { plugin } from 'bun';

import { countedCorpus } from './kjv';

plugin({
  name: 'heartseed-exact-kjv',
  setup(build) {
    build.module('virtual:heartseed-kjv', () => ({
      exports: { default: countedCorpus() },
      loader: 'object',
    }));
  },
});
