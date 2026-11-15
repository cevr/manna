import { test } from 'bun:test';
import { assertNoCopies } from '@manna/exact-kit/no-copy/testing';

test('Heartseed on Exact copies no source file of the current Heartseed: it imports them', () =>
  assertNoCopies(
    new URL('..', import.meta.url).pathname,
    new URL('../../heartseed/src', import.meta.url).pathname,
  ));

test('nor of its build-time derivations', () =>
  assertNoCopies(
    new URL('..', import.meta.url).pathname,
    new URL('../../heartseed/vite', import.meta.url).pathname,
  ));
