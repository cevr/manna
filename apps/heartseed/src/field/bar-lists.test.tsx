/* oxlint-disable effect/noAsyncFunction -- the walk drives the root through React's promise-based `act`, one awaited tap at a time. */

/**
 * The field's bar as passages are added (hspassage C2-C4, C12, C13) on
 * generated readers through `test/bar-walk.ts`: `[]` and a list of 3 held;
 * 1 or 2 failed reads of the passages' key, read; other plants; `Add
 * verses` from none held, by the bar's and by the row's, and the chooser
 * left back to the field; the limit line at launch; and a round trip from
 * home by `Start`. Every frame keeps the bar's controls, the alert and the
 * limit line out of the scroll view, one heading, the root's frame rule,
 * and every seen text at AA. Its devices alone must reach those cases;
 * `bar-adds.test.tsx` walks the rest of the adds.
 *
 * It catches a bar that scrolls, an add offered at 3 or more, a field
 * blind to the passages or to a new one, rows out of order, a lost other
 * plant, and any write but a landed change.
 */

import { expect, it } from 'bun:test';

import { walkBars } from '../test/bar-walk';

it('offers an add under 3 passages held, and the limit line at 3 or more', async () => {
  const { faults, reached } = await walkBars([109, 230], 5, 'bar');
  expect(faults).toEqual([]);
  const floors = [
    'reads:1',
    'reads:2',
    'stored:[]',
    'held:0',
    'held:3',
    'add:from-0',
    'add:left',
    'add:by add-list',
    'limit:at launch',
    'other plant',
    'round:by Start',
  ];
  expect(floors.filter((floor) => !reached.has(floor))).toEqual([]);
});
