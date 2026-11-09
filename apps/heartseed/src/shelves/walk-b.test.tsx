/* oxlint-disable effect/noAsyncFunction -- the walk drives the sheet through React's promise-based `act`, one awaited tap at a time. */

/**
 * The Add verses sheet's refusals and ways out (hsshelves S2, S3, B) on
 * generated readers through `test/shelves-walk.ts`: a refused write, a
 * retry that lands, the alert cleared by the next tap on a shelf, and the
 * sheet left by `Done`, Escape and `Any passage`. Its devices alone must
 * reach those cases, each as often as its floor.
 *
 * It catches a sheet that closes after a refusal or loses its open shelf,
 * an alert missing, naming the wrong list or left after the next tap, a
 * refused write that stores, a close that writes, and `Done`, `Any
 * passage` and a landed plant counted one for another.
 */

import { expect, it } from 'bun:test';

import { missed, walkShelves } from '../test/shelves-walk';

it('keeps the sheet and its shelf with the alert after a refusal, clears it by the next tap, and leaves by each way out', async () => {
  const { faults, reached } = await walkShelves([106, 107, 108, 109], 14);
  expect(faults).toEqual([]);
  expect(
    missed(reached, [
      ['plant:Failed', 2],
      ['retry landed', 1],
      ['line cleared by a tap', 1],
      ['done:Done', 2],
      ['done:Escape', 1],
      ['any', 2],
    ]),
  ).toEqual([]);
});
