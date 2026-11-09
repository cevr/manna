/* oxlint-disable effect/noAsyncFunction -- the walk drives the root through React's promise-based `act`, one awaited tap at a time. */

/**
 * The reader's adds through the root (hspassage C1, C6-C8, C12, C13) on a
 * generated reader through `test/reader-walk.ts`, leaning toward changes
 * from home, the field each launch opens on, over an empty stored list: a range tapped backward
 * past twenty verses and clipped, a restart, a tap that clears the range,
 * backs to the books and the chapters, Psalms 119, leaving the chooser,
 * and plants of one verse, of twenty and of a whole chapter, then back on
 * Today the next morning a passage verse new and said. Its device alone
 * must reach those cases.
 *
 * It catches a backward range off the rule (not clipped, or clipped from
 * the wrong end), a restart that keeps the old range, an add with no
 * making, Today's plan off the passages after an add, and a fixed control,
 * alert or limit line inside a scroll view in any frame.
 */

import { expect, it } from 'bun:test';

import { walkReaders } from '../test/reader-walk';

it('clips a range tapped backward and restarts one, through the field and the chooser', async () => {
  const { faults, reached } = await walkReaders([38], 16, 'change');
  expect(faults).toEqual([]);
  const floors = [
    'add:Added',
    'clip:back',
    'tap:restart',
    'tap:toggle-off',
    'back:books',
    'back:chapters',
    'choose:left',
    'chapter:176',
    'planted:one-verse',
    'planted:twenty',
    'planted:whole-chapter',
    'today:said-new',
    'home:launch-begin',
    'home:begin',
    'home:no-begin',
  ];
  expect(floors.filter((floor) => !reached.has(floor))).toEqual([]);
});
