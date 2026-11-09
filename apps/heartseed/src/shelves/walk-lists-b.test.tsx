/* oxlint-disable effect/noAsyncFunction -- the walk drives the sheet through React's promise-based `act`, one awaited tap at a time. */

/**
 * The Add verses sheet's Handbook shelves (hshandbook R9, R12, D) on
 * generated readers through `test/lists-walk.ts`, leaning toward the
 * devices: lists held, stored twice or garbled, a pick planted beside a
 * held list, the limit line with a list among the held, and a lists' key
 * that does not decode, which offers no `Plant` and no line. Its devices
 * alone must reach those cases, each as often as its floor; the list
 * plants are `walk-lists-a.test.tsx`'s.
 *
 * It catches a limit counted by the passages alone, a garbled lists' text
 * read as none, an id stored twice counted twice, and a held list offered
 * again.
 */

import { expect, it } from 'bun:test';

import { walkListShelves } from '../test/lists-walk';
import { missed } from '../test/shelves-walk';

it('offers each Handbook list by the lists and passages held, the limit counting both, and nothing while the lists are unread', async () => {
  const { faults, reached } = await walkListShelves([1, 4, 13, 15], 8);
  expect(faults).toEqual([]);
  expect(
    missed(reached, [
      ['lists:held', 1],
      ['lists:twice', 1],
      ['lists:garbled', 1],
      ['plant:pick:Added:with a list', 1],
      ['limit', 2],
      ['unread', 1],
    ]),
  ).toEqual([]);
});
