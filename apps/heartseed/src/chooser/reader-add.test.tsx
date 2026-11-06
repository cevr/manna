/* oxlint-disable effect/noAsyncFunction -- the walk drives the root through React's promise-based `act`, one awaited tap at a time. */

/**
 * The reader's adds through the root (hspassage C1, C6-C9, C12, C13) on
 * generated readers through `test/reader-walk.ts`, leaning toward changes
 * from Today's field: the chooser opened from the field's bar, a range
 * clipped forward and back, a tap that clears it, a restart, backs to the
 * books and the chapters, Psalms 119, leaving the chooser, and a plant
 * landing, refused, retried and tapped twice in one turn, of one verse, of
 * twenty, of a whole chapter and over the promise's verse. Its devices alone
 * must reach those cases.
 *
 * It catches a double tap that writes twice, a refusal that leaves or says
 * nothing, a range off the rule, an add with no making, Today's plan off
 * the passages after an add, and a fixed control, alert or limit line inside
 * a scroll view in any frame.
 */

import { expect, it } from 'bun:test';

import { walkReaders } from '../test/reader-walk';

it('adds the reader’s passages through the field and the chooser, one change at a time', async () => {
  const { faults, reached } = await walkReaders([63, 38], 16, 'change');
  expect(faults).toEqual([]);
  const floors = [
    'add:Added',
    'add:Failed',
    'add:double',
    'add:retried',
    'clip:forward',
    'clip:back',
    'tap:toggle-off',
    'tap:restart',
    'back:books',
    'back:chapters',
    'choose:left',
    'chapter:176',
    'planted:one-verse',
    'planted:twenty',
    'planted:whole-chapter',
    'planted:over-promise',
  ];
  expect(floors.filter((floor) => !reached.has(floor))).toEqual([]);
});
