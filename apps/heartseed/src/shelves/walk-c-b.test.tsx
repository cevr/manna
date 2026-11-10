/* oxlint-disable effect/noAsyncFunction -- the walk drives the sheet through React's promise-based `act`, one awaited tap at a time. */

/**
 * The Add verses sheet's shelves and offers (hsshelves S2, S4, B) on two
 * more generated readers through `test/shelves-walk.ts`, the other half of
 * `walk-c.test.tsx`'s devices: some passages held and 4 held (the limit
 * line); shelves opened, switched and closed; offers in the field by a
 * held range. Its devices alone must reach those cases, each as often as
 * its floor.
 *
 * It catches an offer whose state is not `offerModel`'s over home's field
 * (without its held ranges), two shelves open, an offer under a closed
 * shelf, and a limit line missing or shown under 3 held.
 */

import { expect, it } from 'bun:test';

import { missed, walkShelves } from '../test/shelves-walk';

it('shows the shelves and each offer as the model does over passages held, to the limit', async () => {
  const { faults, reached } = await walkShelves([19, 20], 14);
  expect(faults).toEqual([]);
  expect(
    missed(reached, [
      ['stored:held', 1],
      ['stored:4', 1],
      ['limit', 2],
      ['shelf:open', 3],
      ['shelf:switch', 3],
      ['shelf:close', 3],
      ['offer:in-field:held', 2],
    ]),
  ).toEqual([]);
});
