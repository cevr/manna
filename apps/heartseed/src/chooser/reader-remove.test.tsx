/* oxlint-disable effect/noAsyncFunction -- the walk drives the root through React's promise-based `act`, one awaited tap at a time. */

/**
 * The reader's removes through the root (hspassage C3-C5, C9, C12, C13) on
 * generated readers through `test/reader-walk.ts`, leaning toward changes
 * from home, the field each launch opens on: a remove landing, refused, kept, moved to another row
 * and tapped twice in one turn, one of equal passages, an alert cleared by
 * the next tap and dropped by leaving, unread passages by 3 failed reads of
 * their key alone, and a stored list of 4 or more. Its devices alone must
 * reach those cases.
 *
 * It catches a double tap that removes two, the wrong row removed, a
 * refusal said nowhere, a remove with no making, an add or remove offered
 * over unread passages or beside the limit line, and any write but a
 * landed change's.
 */

import { expect, it } from 'bun:test';

import { walkReaders } from '../test/reader-walk';

it('removes the reader’s passages from the field once asked, one change at a time', async () => {
  const { faults, reached } = await walkReaders([33, 141], 12, 'change');
  expect(faults).toEqual([]);
  const floors = [
    'remove:Removed',
    'remove:Failed',
    'remove:Keep',
    'remove:double',
    'remove:one-of-equals',
    'alert:cleared by a tap',
    'ask:moved',
    'alert:dropped by leaving',
    'gen:read-faults-3',
    'gen:stored-4+',
    'launch:Unread',
    'home:launch-begin',
    'home:begin',
  ];
  expect(floors.filter((floor) => !reached.has(floor))).toEqual([]);
});
