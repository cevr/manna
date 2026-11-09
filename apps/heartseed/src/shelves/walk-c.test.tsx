/* oxlint-disable effect/noAsyncFunction -- the walk drives the sheet through React's promise-based `act`, one awaited tap at a time. */

/**
 * The Add verses sheet's shelves and offers (hsshelves S2, S4, B) on
 * generated readers through `test/shelves-walk.ts`, leaning toward what the
 * stored value and the field make of the offers: no passages, some held, 4
 * held (the limit line) and a garbled value (no `Plant`, no line); shelves
 * opened, switched and closed; offers in the field by a held range and by
 * a loose verse alone. Its devices alone must reach those cases, each as
 * often as its floor.
 *
 * It catches an offer whose state is not `offerModel`'s over home's field
 * (without its loose rows or its held ranges), two shelves open, an offer
 * under a closed shelf, a limit line missing or shown under 3 held, and a
 * `Plant` over unread passages.
 */

import { expect, it } from 'bun:test';

import { missed, walkShelves } from '../test/shelves-walk';

it('shows the shelves and each offer as the model does over every stored value and field', async () => {
  const { faults, reached } = await walkShelves([17, 18, 19, 20], 14);
  expect(faults).toEqual([]);
  expect(
    missed(reached, [
      ['stored:none', 1],
      ['stored:held', 1],
      ['stored:4', 1],
      ['stored:garbled', 1],
      ['unread', 1],
      ['limit', 2],
      ['shelf:open', 3],
      ['shelf:switch', 3],
      ['shelf:close', 3],
      ['offer:in-field:held', 2],
      ['offer:in-field:loose', 1],
    ]),
  ).toEqual([]);
});
