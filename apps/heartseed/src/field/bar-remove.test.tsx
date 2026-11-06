/* oxlint-disable effect/noAsyncFunction -- the walk drives the root through React's promise-based `act`, one awaited tap at a time. */

/**
 * The field's `Remove` and its ask (hspassage C4, C5) on generated readers
 * through `test/bar-walk.ts`, leaning toward the ask's answers: a remove
 * that lands from 1, 2, 3 and 4 or more held, the first of equal rows taken
 * from a later equal row, a refused write then a retry that lands, `Keep`,
 * an ask moved to another row and one dropped by leaving, an alert cleared
 * by the next tap, and a removed passage's planted verse shown as its own
 * row. Its devices alone must reach those cases.
 *
 * It catches a `Remove` on the wrong row, on a row that is not a
 * passage's or missing from one, an ask skipped, not closed or about the
 * wrong passage, a failure said nowhere, an alert that stays, a removed
 * passage's plants dropped, and a write of anything but the model's list.
 */

import { expect, it } from 'bun:test';

import { walkBars } from '../test/bar-walk';

it('removes the passage a row names once its write lands, after one ask', async () => {
  const { faults, reached } = await walkBars([21, 3], 5, 'remove');
  expect(faults).toEqual([]);
  const floors = [
    'remove:from-1',
    'remove:from-2',
    'remove:from-3',
    'remove:from-4+',
    'remove:one of equals',
    'ask:a later equal row',
    'remove:Failed',
    'remove:retry landed',
    'remove:Keep',
    'ask:moved',
    'ask:dropped by leaving',
    'alert:cleared by a tap',
    'removed:a planted verse as its own row',
    'stored:over-promise',
  ];
  expect(floors.filter((floor) => !reached.has(floor))).toEqual([]);
});
