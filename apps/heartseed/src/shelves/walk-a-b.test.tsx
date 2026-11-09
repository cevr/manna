/* oxlint-disable effect/noAsyncFunction -- the walk drives the sheet through React's promise-based `act`, one awaited tap at a time. */

/**
 * The Add verses sheet's `Plant` (hsshelves S3, B) on two more generated
 * readers through `test/shelves-walk.ts`, the other half of
 * `walk-a.test.tsx`'s devices: adds from 1 and 2 held, of a promise, `Plant`
 * twice in one turn that stores once, and `Plant` then `Done` in one turn.
 * Its devices alone must reach those cases, each as often as its floor.
 *
 * It catches the same faults as `walk-a.test.tsx` on other readers.
 */

import { expect, it } from 'bun:test';

import { missed, walkShelves } from '../test/shelves-walk';

it('plants an offer once its write lands, once for two taps in one turn, and once for Plant then Done in one turn', async () => {
  const { faults, reached } = await walkShelves([29, 31], 14);
  expect(faults).toEqual([]);
  expect(
    missed(reached, [
      ['plant:Added:from-1', 1],
      ['plant:Added:from-2', 1],
      ['plant:Added:promise', 1],
      ['plant:twice', 1],
      ['plant:then-Done', 1],
    ]),
  ).toEqual([]);
});
