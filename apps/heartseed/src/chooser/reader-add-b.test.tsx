/* oxlint-disable effect/noAsyncFunction -- the walk drives the root through React's promise-based `act`, one awaited tap at a time. */

/**
 * The reader's adds through the root, cut from `reader-add.test.tsx` for
 * its time budget, on a second generated reader through
 * `test/reader-walk.ts` leaning toward changes from home: the chooser
 * opened through the Add verses sheet's `Any passage`, a range clipped
 * forward, a tap that clears it, a back to the chapters, Psalms 119,
 * leaving the chooser by its `Add verses` back and the sheet's `Done`, and
 * a plant landing and tapped twice in one turn, of one verse, of twenty and
 * over the promise's verse. With `reader-add.test.tsx` it meets every floor
 * that part held on one device.
 *
 * It catches a double tap that writes twice, a range off the rule, an add
 * with no making, Today's plan off the passages after an add, a sheet left
 * open or never shown, and a fixed control, alert or limit line inside a
 * scroll view in any frame.
 */

import { expect, it } from 'bun:test';

import { walkReaders } from '../test/reader-walk';

it('adds the reader’s passages through the sheet and the chooser: clipped, twice in one turn, twenty verses and over the promise', async () => {
  const { faults, reached } = await walkReaders([202], 10, 'change');
  expect(faults).toEqual([]);
  const floors = [
    'add:Added',
    'add:double',
    'clip:forward',
    'tap:toggle-off',
    'back:chapters',
    'choose:left',
    'chapter:176',
    'planted:one-verse',
    'planted:twenty',
    'planted:over-promise',
    'home:launch-begin',
  ];
  expect(floors.filter((floor) => !reached.has(floor))).toEqual([]);
});
