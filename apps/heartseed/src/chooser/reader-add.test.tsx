/* oxlint-disable effect/noAsyncFunction -- the walk drives the root through React's promise-based `act`, one awaited tap at a time. */

/**
 * The reader's adds through the root (hspassage C1, C6-C9, C12, C13) on a
 * generated reader through `test/reader-walk.ts`, leaning toward changes
 * from home, the field each launch opens on: the chooser opened from the
 * field's bar through the Add verses sheet's `Any passage`, a tap that
 * clears the range, backs to the books and the chapters, leaving the
 * chooser by its `Add verses` back and the sheet's `Done`, and a plant
 * landing, refused and retried, of one verse and of a whole chapter. Its
 * device alone must reach those cases; `reader-add-b.test.tsx` owns the
 * range clipped forward, Psalms 119, a plant tapped twice in one turn, of
 * twenty verses and over the promise's verse, and `reader-add-back.test.tsx`
 * the range clipped back and the restart.
 *
 * It catches a double tap that writes twice, a refusal that leaves or says
 * nothing, a range off the rule, an add with no making, Today's plan off
 * the passages after an add, a sheet left open or never shown, and a fixed
 * control, alert or limit line inside a scroll view in any frame.
 */

import { expect, it } from 'bun:test';

import { walkReaders } from '../test/reader-walk';

it('adds the reader’s passages through the field, the sheet and the chooser, one change at a time', async () => {
  const { faults, reached } = await walkReaders([23], 10, 'change');
  expect(faults).toEqual([]);
  const floors = [
    'add:Added',
    'add:Failed',
    'add:retried',
    'tap:toggle-off',
    'back:books',
    'back:chapters',
    'choose:left',
    'planted:one-verse',
    'planted:whole-chapter',
    'home:launch-begin',
    'home:begin',
  ];
  expect(floors.filter((floor) => !reached.has(floor))).toEqual([]);
});
