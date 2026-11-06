/* oxlint-disable effect/noAsyncFunction -- the walk drives the screen through React's promise-based `act`, one awaited tap at a time. */

/**
 * The chooser's Plant (hspassage C8, C9) on generated readers through
 * `test/chooser-walk.ts`, leaning toward the plant's answers: an add that
 * lands from 0, 1 and 2 held, a refused write then a retry that lands, two
 * taps of `Plant` in one turn and `Plant` with a back in one turn, each with
 * the write landing and refused. Its devices alone must reach those cases.
 *
 * It catches a plant whose failure leaves the chooser or says nothing, a
 * range lost after a refusal, an alert a tap does not clear, a double tap
 * that plants twice, a back taken while a plant is pending, an add written
 * before it lands, and a next open that keeps the last range.
 */

import { expect, it } from 'bun:test';

import { walkChoosers } from '../test/chooser-walk';

it('plants a range once its write lands, and keeps it with the alert when the write is refused', async () => {
  const { faults, reached } = await walkChoosers([13, 36, 9], 3);
  expect(faults).toEqual([]);
  const floors = [
    'added:from-0',
    'added:from-1',
    'added:from-2',
    'plant:Failed',
    'after a refusal: retry',
    'plant:twice:Added',
    'plant:twice:Failed',
    'plant:then-back:Added',
    'plant:then-back:Failed',
    'opened again',
  ];
  expect(floors.filter((floor) => !reached.has(floor))).toEqual([]);
});
