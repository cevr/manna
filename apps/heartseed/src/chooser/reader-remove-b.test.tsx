/* oxlint-disable effect/noAsyncFunction -- the walk drives the root through React's promise-based `act`, one awaited tap at a time. */

/**
 * The reader's removes through the root (hspassage C3-C5, C9, C12, C13),
 * part b: a generated reader through `test/reader-walk.ts`, leaning toward
 * changes from home, the field each launch opens on: a remove refused, an
 * alert dropped by leaving, and unread passages by 3 failed reads of their
 * key alone, a launch over them. Its device alone must reach those cases.
 *
 * It catches a refusal said nowhere, an add or remove offered over unread
 * passages, an alert kept past leaving, and any write but a landed
 * change's.
 */

import { expect, it } from 'bun:test';

import { walkReaders } from '../test/reader-walk';

it('removes the reader’s passages from the field once asked, over unread passages too', async () => {
  const { faults, reached } = await walkReaders([141], 12, 'change');
  expect(faults).toEqual([]);
  const floors = [
    'remove:Failed',
    'alert:dropped by leaving',
    'gen:read-faults-3',
    'launch:Unread',
    'home:launch-begin',
    'home:begin',
  ];
  expect(floors.filter((floor) => !reached.has(floor))).toEqual([]);
});
