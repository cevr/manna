/* oxlint-disable effect/noAsyncFunction -- the walk drives the root through React's promise-based `act`, one awaited tap at a time. */

/**
 * Today over the reader's passages (hspassage C3, C11-C13) on a generated
 * reader through `test/reader-walk.ts`, leaning toward Today, over a stored
 * list of four read three times and failed, so unread, in Chatham: a
 * Minutes tap, relaunches after the next 04:00 local, and removes on the
 * field once the passages read. Its device alone must reach: unread
 * passages, a passage verse's review, a making at a remove and at a
 * Minutes tap, and a second morning.
 *
 * It catches a change that makes no plan, Today's counts or shown verse off
 * the plan over the reader's pieces, an add or a remove offered over unread
 * passages, a field or chooser control on Today or inside a scroll view,
 * and any write but a recall, the minutes after a tap, and the passages
 * after a landed change.
 */

import { expect, it } from 'bun:test';

import { walkReaders } from '../test/reader-walk';

it('shows Today the plan over unread passages, through removes and mornings', async () => {
  const { faults, reached } = await walkReaders([150], 12, 'today');
  expect(faults).toEqual([]);
  const floors = [
    'today:review-passage-verse',
    'day:next-morning',
    'day:after',
    'made:minutes',
    'made:remove',
    'zone:Pacific/Chatham',
    'launch:Unread',
  ];
  expect(floors.filter((floor) => !reached.has(floor))).toEqual([]);
});
