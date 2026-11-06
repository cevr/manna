/* oxlint-disable effect/noAsyncFunction -- the walk drives the screen through React's promise-based `act`, one awaited tap at a time. */

/**
 * The chooser (hspassage C6-C9) on generated readers through
 * `test/chooser-walk.ts`, leaning toward the taps and the answers that add
 * nothing: the tap patterns, a back from each step and in again, leaving
 * and opening again, `Full` over 3 held and `Unread` over a garbled value,
 * each after two taps in one turn and `Plant` with a back. Its devices
 * alone must reach those cases.
 *
 * It catches a range other than the tap rule's on screen, a back that keeps
 * the range, the limit line or the alert missing or left after the next
 * tap, a write over unread passages, and a next open that is not the books
 * with no range.
 */

import { expect, it } from 'bun:test';

import { walkChoosers } from '../test/chooser-walk';

it('shows each step, the range and the footer as the rule does, and adds nothing it cannot', async () => {
  const { faults, reached } = await walkChoosers([1, 3, 16], 3);
  expect(faults).toEqual([]);
  const floors = [
    'taps:forward',
    'taps:toggle',
    'taps:restart',
    'taps:twenty',
    'back:books',
    'back:chapters',
    'left',
    'opened again',
    'plant:Full',
    'plant:Unread',
    'plant:twice:Unread',
    'plant:then-back:Full',
    'after a refusal: a verse',
  ];
  expect(floors.filter((floor) => !reached.has(floor))).toEqual([]);
});
