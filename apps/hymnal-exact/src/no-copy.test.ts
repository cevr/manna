import { test } from 'bun:test';
import { assertNoCopies } from '@manna/exact-kit/no-copy';

test('the hymnal on Exact copies no source file of the current hymnal: it imports them', () =>
  assertNoCopies(
    new URL('..', import.meta.url).pathname,
    new URL('../../hymnal/src', import.meta.url).pathname,
  ));
