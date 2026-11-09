/* oxlint-disable effect/noAsyncFunction -- the walk drives the sheet through React's promise-based `act`, one awaited tap at a time. */

/**
 * The Add verses sheet's Handbook shelves (hshandbook R12, D) on generated
 * readers through `test/lists-walk.ts`, leaning toward the list plants: a
 * list planted from 0, 1 and 2 held, beside a passage and beside an id this
 * build does not know (kept in place), a refused write and its retry, two
 * taps in one turn that store once, and a write held while every control
 * shows disabled. Its devices alone must reach those cases, each as often
 * as its floor; the devices, a pick beside a list, the limit and an unread
 * lists' key are `walk-lists-b.test.tsx`'s.
 *
 * It catches a list plant that writes twice, drops or moves an unknown id,
 * lands while pending controls stay live, or shows the alert on a landed
 * plant, and an offer whose state is not the model's.
 */

import { expect, it } from 'bun:test';

import { walkListShelves } from '../test/lists-walk';
import { missed } from '../test/shelves-walk';

it('plants a Handbook list whole once its write lands, once for two taps in one turn, keeping every stored id in place', async () => {
  const { faults, reached } = await walkListShelves([2, 3, 6, 11], 8);
  expect(faults).toEqual([]);
  expect(
    missed(reached, [
      ['lists:none', 1],
      ['lists:unknown', 1],
      ['shelf:open', 3],
      ['shelf:switch', 1],
      ['plant:list:Added:from-0', 1],
      ['plant:list:Added:from-1', 1],
      ['plant:list:Added:from-2', 1],
      ['plant:list:Added:with a passage', 1],
      ['plant:list:Added:beside an unknown id', 1],
      ['plant:list:Failed', 2],
      ['retry landed', 1],
      ['plant:list:twice', 1],
      ['pending', 1],
      ['offer:in-field', 2],
    ]),
  ).toEqual([]);
});
