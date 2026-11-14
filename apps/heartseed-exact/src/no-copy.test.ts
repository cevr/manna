import { test } from 'bun:test';
import { assertNoCopies } from '@manna/exact-kit/no-copy';

test('Heartseed on Exact copies no source file of the current Heartseed: it imports them', () =>
  assertNoCopies(
    new URL('..', import.meta.url).pathname,
    new URL('../../heartseed/src', import.meta.url).pathname,
  ));
