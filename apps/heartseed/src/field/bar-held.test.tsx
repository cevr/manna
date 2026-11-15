/* oxlint-disable effect/noAsyncFunction -- the walk drives the root through React's promise-based `act`, one awaited tap at a time. */

/**
 * The field's bar and rows over read stored kinds (hspassage C3, C4, C12):
 * on generated readers through `test/bar-walk.ts`, lists of 1, 2 and 4
 * held with equal passages, a failed read read, and other plants. Its
 * devices alone must reach those cases; `bar-kinds.test.tsx` holds the
 * unread ones.
 *
 * It catches a field blind to a stored list past the caps, and a `Remove`
 * on the page of a list that is not a passage's.
 *
 * Its floors are those its own devices reach; `bar-held-b.test.tsx`, its own part,
 * holds the rest of the floors named here.
 */

import { expect, it } from 'bun:test';

import { walkBars } from '../test/bar-walk';

it('reads every passage held as its own row, past the caps and with equal passages', async () => {
  const { faults, reached } = await walkBars([0, 33], 5, 'bar');
  expect(faults).toEqual([]);
  const floors = ['held:1', 'held:2', 'other plant'];
  expect(floors.filter((floor) => !reached.has(floor))).toEqual([]);
});
