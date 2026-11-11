/* oxlint-disable effect/noAsyncFunction -- the walk drives the root through React's promise-based `act`, one awaited tap at a time. */

/**
 * The field's bar and rows over unread stored kinds (hspassage C3, C12):
 * on generated readers through `test/bar-walk.ts`, a garbled value and 3
 * failed reads of the passages' key alone (unread: no add, no remove, no
 * limit line and no `When I need…` on any frame, `Start` offered and taken
 * to Today, and the planted verses of the stored list as one-verse rows),
 * and other plants. Its devices alone must reach those cases;
 * `bar-held.test.tsx` holds the read lists.
 *
 * It catches an add or a remove offered over unread passages, a write over
 * them, a home over them with no way to Today, and a field blind to the
 * planted verses of an unread list.
 */

import { expect, it } from 'bun:test';

import { walkBars } from '../test/bar-walk';

it('offers no add and no remove over unread passages, their planted verses each its own row', async () => {
  const { faults, reached } = await walkBars([161, 16], 5, 'bar');
  expect(faults).toEqual([]);
  const floors = [
    'launch:Unread',
    'unread:a planted passage verse as its own row',
    'reads:3',
    'other plant',
    'round:by Start',
  ];
  expect(floors.filter((floor) => !reached.has(floor))).toEqual([]);
  expect([...reached.keys()].some((each) => each.startsWith('stored:garbled'))).toBe(true);
});
