/**
 * The Bun tests' preload: the current Heartseed's `virtual:heartseed-kjv`,
 * which its lists and passages read through `src/kjv.ts`, is the chapters
 * the garden ships (`chapters.ts`: each chapter's verse count, no text), as
 * Exact's bundle has them through `tsconfig.json`. So the tests import the
 * current app's modules unchanged, and pass with the written file absent.
 */

import { plugin } from 'bun';

import { readChapters } from './chapters';

plugin({
  name: 'heartseed-exact-chapters',
  setup(build) {
    build.module('virtual:heartseed-kjv', () => ({
      exports: { default: readChapters() },
      loader: 'object',
    }));
  },
});
