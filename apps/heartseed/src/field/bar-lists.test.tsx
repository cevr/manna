/* oxlint-disable effect/noAsyncFunction -- the walk drives the root through React's promise-based `act`, one awaited tap at a time. */

/**
 * The field's bar as passages are added (hspassage C2-C4, C12, C13) on
 * generated readers through `test/bar-walk.ts`: no key, `[]`, and lists of
 * 3 and 5 held; 1 or 2 failed reads of the passages' key, read; other
 * plants; `Add a passage` from 0, 1 and 2 held, and the chooser left back
 * to the field; the limit line at launch and after an add; and an alert
 * dropped by leaving. Every frame keeps the bar's controls, the alert and
 * the limit line out of the scroll view, one heading, and every seen text
 * at AA. Its devices alone must reach those cases.
 *
 * It catches a bar that scrolls, an add offered at 3 or more, a field
 * blind to the passages or to a new one, rows out of order, a lost other
 * plant, and any write but a landed change.
 */

import { expect, it } from 'bun:test';

import { walkBars } from '../test/bar-walk';

it('offers an add under 3 passages held, and the limit line at 3 or more, a new passage last', async () => {
  const { faults, reached } = await walkBars([120, 122, 110, 125], 5, 'bar');
  expect(faults).toEqual([]);
  const floors = [
    'reads:1',
    'reads:2',
    'stored:no key',
    'stored:[]',
    'held:0',
    'held:3',
    'held:5',
    'add:from-0',
    'add:from-1',
    'add:from-2',
    'add:left',
    'limit:at launch',
    'limit:after an add',
    'alert:dropped by leaving',
    'other plant',
  ];
  expect(floors.filter((floor) => !reached.has(floor))).toEqual([]);
});
