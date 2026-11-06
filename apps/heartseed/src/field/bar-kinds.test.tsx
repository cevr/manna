/* oxlint-disable effect/noAsyncFunction -- the walk drives the root through React's promise-based `act`, one awaited tap at a time. */

/**
 * The field's bar and rows over the stored kinds (hspassage C3, C4, C12):
 * on generated readers through `test/bar-walk.ts`, a garbled value and 3
 * failed reads of the passages' key alone (unread: no add, no remove and
 * no limit line on any frame, and the planted verses of the stored list as
 * one-verse rows), lists of 1, 2 and 4 held with equal passages, a failed
 * read read, and other plants. Its devices alone must reach those cases.
 *
 * It catches an add or a remove offered over unread passages, a write over
 * them, a field blind to a stored list past the caps, and a `Remove` on a
 * row that is not a passage's.
 */

import { expect, it } from 'bun:test';

import { walkBars } from '../test/bar-walk';

it('offers no add and no remove over unread passages, and every passage read its own row', async () => {
  const { faults, reached } = await walkBars([161, 16, 42, 139, 159], 5, 'bar');
  expect(faults).toEqual([]);
  const floors = [
    'launch:Unread',
    'unread:a planted passage verse as its own row',
    'reads:1',
    'reads:3',
    'held:1',
    'held:2',
    'held:4',
    'stored:4+',
    'ask:a later equal row',
    'other plant',
  ];
  expect(floors.filter((floor) => !reached.has(floor))).toEqual([]);
  expect([...reached.keys()].some((each) => each.startsWith('stored:garbled'))).toBe(true);
});
