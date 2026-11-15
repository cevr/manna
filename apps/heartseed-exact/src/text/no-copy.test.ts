import { test } from 'bun:test';
import { assertNoCopies } from '@manna/exact-kit/no-copy/testing';

test('Heartseed on Exact copies no bundle-time derivation of the current Heartseed (the corpus, the passage): it imports them', () =>
  assertNoCopies(
    new URL('../..', import.meta.url).pathname,
    new URL('../../../heartseed/vite', import.meta.url).pathname,
  ));
