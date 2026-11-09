/* oxlint-disable effect/noAsyncFunction -- the walk drives the sheet through React's promise-based `act`, one awaited tap at a time. */

/**
 * The Add verses sheet's `Plant` (hsshelves S3, B) on generated readers
 * through `test/shelves-walk.ts`, leaning toward the adds that land: from
 * 0, 1 and 2 held, of a pick and of a promise, `Plant` twice in one turn
 * that stores once, `Plant` then `Done` in one turn, and a write held while
 * every control shows disabled. Its devices alone must reach those cases,
 * each as often as its floor.
 *
 * It catches a sheet that stays open after `Added`, a double tap or a
 * `Done` in the plant's turn that stores twice or closes the sheet, a
 * control live while a plant is pending, a write that is not `addRule`'s,
 * and a landed plant counted as `Done`. Its other two devices walk in
 * `walk-a-b.test.tsx`.
 */

import { expect, it } from 'bun:test';

import { missed, walkShelves } from '../test/shelves-walk';

it('plants an offer once its write lands, once for two taps in one turn, and holds every control while it is pending', async () => {
  const { faults, reached } = await walkShelves([30, 32], 14);
  expect(faults).toEqual([]);
  expect(
    missed(reached, [
      ['plant:Added:from-0', 1],
      ['plant:Added:from-1', 1],
      ['plant:Added:from-2', 1],
      ['plant:Added:pick', 1],
      ['plant:Added:promise', 1],
      ['plant:twice', 1],
      ['plant:then-Done', 1],
      ['pending', 2],
    ]),
  ).toEqual([]);
});
