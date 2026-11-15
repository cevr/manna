/* oxlint-disable effect/noAsyncFunction -- the walk drives the root through React's promise-based `act`, one awaited tap at a time. */

/**
 * The second part of `bar-adds.test.tsx`, split so each part runs alone under its
 * budget: generated device 184, holding the floors `bar-adds.test.tsx`'s own
 * devices leave unreached.
 *
 * The field's bar as passages are added one after another (hspassage
 * C2-C4, C12, C13) on generated readers through `test/bar-walk.ts`: no
 * key and a list of 5 held; `Add verses` from 0, 1 and 2 held, a new
 * passage last; the limit line after an add; an alert dropped by leaving;
 * other plants; and a round trip from home by `Start`. Every frame keeps
 * the bar's controls, the alert and the limit line out of the scroll view,
 * one heading, the root's frame rule, and every seen text at AA. Its
 * devices alone must reach those cases; `bar-lists.test.tsx` walks the
 * other lists.
 *
 * It catches an add that lands anywhere but last, an add offered once 3
 * are held, an alert that outlives leaving, and any write but a landed
 * change.
 */

import { expect, it } from 'bun:test';

import { walkBars } from '../test/bar-walk';

it('adds a new passage last from 0, 1 and 2 held, then shows the limit line', async () => {
  const { faults, reached } = await walkBars([184], 5, 'bar');
  expect(faults).toEqual([]);
  const floors = ['held:5', 'alert:dropped by leaving', 'round:by Start'];
  expect(floors.filter((floor) => !reached.has(floor))).toEqual([]);
});
