/* oxlint-disable effect/noAsyncFunction -- the walk drives the root through React's promise-based `act`, one awaited tap at a time. */

/**
 * One change at a time on a list's own page (hspassage C9, hslist L4) on
 * generated readers through `test/bar-walk.ts`: the ask's `Remove` tapped
 * twice in one turn, and with `Your field` or `Keep` in the same turn,
 * each with its write landing and refused, over lists with equal
 * passages. Every frame holds that while the ask's `Remove` is disabled,
 * every other control of the page is too. Its devices alone must reach
 * those cases.
 *
 * It catches a second tap that removes a second passage or answers over
 * the first, a `Your field` or `Keep` taken while a remove is pending,
 * and a control that does nothing then but shows as live.
 */

import { expect, it } from 'bun:test';

import { walkBars } from '../test/bar-walk';

it('makes one change for two taps in one turn, and takes no other tap while it is pending', async () => {
  const { faults, reached } = await walkBars([24, 20], 5, 'twice');
  expect(faults).toEqual([]);
  const floors = [
    'remove:twice:Removed',
    'remove:twice:Failed',
    'remove:then Your field:Removed',
    'remove:then Your field:Failed',
    'remove:then Keep:Removed',
    'remove:then Keep:Failed',
  ];
  expect(floors.filter((floor) => !reached.has(floor))).toEqual([]);
});
