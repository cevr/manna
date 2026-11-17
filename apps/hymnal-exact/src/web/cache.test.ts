/**
 * The plain host's cache rule (`cacheOf` of `tools/web/serve.ts`): a file
 * whose name ends in the bundler's eight-character base64url digest keeps
 * for a year, `-` and `_` in the digest too, so a warm load asks nothing for
 * it; every other file revalidates.
 */

import { describe, expect, test } from 'bun:test';

import { cacheOf } from '../../tools/web/serve.ts';

const KEPT = 'public, max-age=31536000, immutable';

describe('the plain host keeps a digested file for a year', () => {
  test.each([
    'input-glue-cHFAhYn8.js',
    'presence-glue-AGqduZL-.js',
    'fragment-D9kbAD_i.js',
    'storage-environment-BZSOwY8i.js',
    'style-Ab_9-xYz.css',
  ])('%s is kept', (file) => {
    expect(cacheOf(file)).toBe(KEPT);
  });

  test.each([
    'app.js',
    'audio-session.js',
    'presence-glue.js',
    'style.css',
    'index.html',
    'app.plan',
  ])('%s revalidates', (file) => {
    expect(cacheOf(file)).toBe('no-cache');
  });
});
