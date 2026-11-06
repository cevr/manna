/* oxlint-disable effect/noAsyncFunction -- the walk drives the screen through React's promise-based `act`, one awaited tap at a time. */

/**
 * The chooser (hspassage C6-C9) on generated readers through
 * `test/chooser-walk.ts`, leaning toward leaving: one verse tapped, a range
 * tapped backward, a refused plant with a back in the same turn, then
 * leaving the chooser step by step and opening it again. Its devices alone
 * must reach those cases.
 *
 * It catches a back that skips a step or keeps the range, an alert left
 * behind on the way out, a write by leaving, and a next open that is not
 * the books with no range.
 */

import { expect, it } from 'bun:test';

import { walkChoosers } from '../test/chooser-walk';

it('leaves one step at a time, keeps nothing on the way out, and opens again at the books', async () => {
  const { faults, reached } = await walkChoosers([38, 2], 3);
  expect(faults).toEqual([]);
  const floors = [
    'taps:one',
    'taps:back',
    'left',
    'opened again',
    'plant:then-back:Failed',
    'after a refusal: leave',
  ];
  expect(floors.filter((floor) => !reached.has(floor))).toEqual([]);
});
