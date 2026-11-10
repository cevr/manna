/* oxlint-disable effect/noAsyncFunction -- the walk drives the sheet through React's promise-based `act`, one awaited tap at a time. */

/**
 * The Add verses sheet's ways out (hsshelves S2, S3, B) on two more
 * generated readers through `test/shelves-walk.ts`, the other half of
 * `walk-b.test.tsx`'s devices: the sheet left by `Done`, Escape and `Any
 * passage`. Its devices alone must reach those cases, each as often as its
 * floor.
 *
 * It catches the same faults as `walk-b.test.tsx` on other readers.
 */

import { expect, it } from 'bun:test';

import { missed, walkShelves } from '../test/shelves-walk';

it('leaves the sheet by Done, Escape and Any passage', async () => {
  const { faults, reached } = await walkShelves([107, 109], 14);
  expect(faults).toEqual([]);
  expect(
    missed(reached, [
      ['done:Done', 2],
      ['done:Escape', 1],
      ['any', 2],
    ]),
  ).toEqual([]);
});
