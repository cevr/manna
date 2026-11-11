/* oxlint-disable effect/noAsyncFunction -- the walk drives the real root through React's promise-based `act`, one awaited tap at a time. */

/**
 * The Add verses sheet under the real `<Root />` (hsguards7 §C) through
 * `test/root-sheet-walk.ts`, on four more worlds: Proverbs 18:10 by the
 * second of three taught collections, no collection taught, three passages
 * held and unread passages (the last two offering no `Add verses`). Each
 * case is one world, whose script alone must reach its floors.
 *
 * It catches a root that hands the sheet a field without the taught
 * collections, with the first taught collection alone, or of the app's own
 * row alone.
 */

import { expect, it } from 'bun:test';

import { walkRoot } from '../test/root-sheet-walk';
import { missed } from '../test/shelves-walk';

it('offers Proverbs 18:10 as in your field by the second of three taught collections', async () => {
  const { faults, reached } = await walkRoot(834);
  expect(faults).toEqual([]);
  expect(
    missed(reached, [
      ['taught:several', 1],
      ['sheet:taught:several', 1],
      ['stored:pick', 1],
      ['stored:part', 1],
      ['in-field:needs-held', 1],
      ['in-field:needs-later-taught', 1],
      ['proverb:in-field:by-taught', 1],
      ['proverb:by-taught:several', 1],
      ['plant:to-3:no-add', 1],
    ]),
  ).toEqual([]);
});

it('offers by the held and planted verses alone when no collection is taught', async () => {
  const { faults, reached } = await walkRoot(64);
  expect(faults).toEqual([]);
  expect(
    missed(reached, [
      ['taught:none', 1],
      ['sheet:taught:none', 1],
      ['in-field:needs-planted', 1],
      ['in-field:needs-held', 1],
      ['proverb:in-field:untaught', 1],
      ['plant:landed', 1],
    ]),
  ).toEqual([]);
});

it('offers no Add a list with three passages held', async () => {
  const { faults, reached } = await walkRoot(59);
  expect(faults).toEqual([]);
  expect(
    missed(reached, [
      ['taught:without', 1],
      ['stored:promise', 1],
      ['stored:proverb', 1],
      ['held-3:no-add', 1],
    ]),
  ).toEqual([]);
});

it('offers no Add a list over unread passages', async () => {
  const { faults, reached } = await walkRoot(6);
  expect(faults).toEqual([]);
  expect(
    missed(reached, [
      ['taught:unknown', 1],
      ['unread:no-add', 1],
    ]),
  ).toEqual([]);
});
