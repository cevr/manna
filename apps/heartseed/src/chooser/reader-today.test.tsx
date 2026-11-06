/* oxlint-disable effect/noAsyncFunction -- the walk drives the root through React's promise-based `act`, one awaited tap at a time. */

/**
 * Today over the reader's passages (hspassage C11-C13) on a generated
 * reader through `test/reader-walk.ts`, leaning toward Today: recitals
 * heard then `Next`, Minutes taps and relaunches after the next 04:00
 * local, between adds on the field and the chooser, in Lord Howe from the
 * first minute's day. Its device alone must reach: a new passage verse with
 * `Listen`, no new verse on a day a verse was first planted and the first
 * verse new the next morning, a second morning, and a making at each add
 * and Minutes tap. `reader-unread.test.tsx` owns unread passages, removes,
 * reviews and Chatham.
 *
 * It catches a change that makes no plan, Today's counts or shown verse off
 * the plan over the reader's pieces, a new verse on a planted day, a field
 * or chooser control on Today or inside a scroll view, and any write but a
 * recall, the minutes after a tap, and the passages after a landed change.
 */

import { expect, it } from 'bun:test';

import { walkReaders } from '../test/reader-walk';

it('shows Today the plan made at each change, over the passages chosen, morning after morning', async () => {
  const { faults, reached } = await walkReaders([92], 12, 'today');
  expect(faults).toEqual([]);
  const floors = [
    'today:said',
    'today:listen',
    'today:fresh-passage-verse',
    'today:no-new-on-a-planted-day',
    'day:new-after-a-planted-day',
    'day:next-morning',
    'day:after',
    'made:minutes',
    'made:add',
    'gen:first-minute-day',
    'planted:on-a-planted-day',
    'zone:Australia/Lord_Howe',
  ];
  expect(floors.filter((floor) => !reached.has(floor))).toEqual([]);
});
