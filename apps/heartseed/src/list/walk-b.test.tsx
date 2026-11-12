/* oxlint-disable effect/noAsyncFunction -- the walk drives the root through React's promise-based `act`, one awaited tap at a time. */

/**
 * The lists' own pages walked through the root (`test/list-walk.tsx`), part
 * b: three more generated readers (seeds 53, 17 and 44, ten commands each),
 * as part a walks them. Its floors: `Practice this list` over a list's
 * first verse to learn and over its open items, a row's tap, Say it
 * listening from a page, a return to the foreground on home and on a page,
 * and a remove refused once and with `Your field` in its turn, the page
 * kept with its alert.
 *
 * It catches a learn started on another verse than the list's first to
 * learn, a refused remove that leaves the page or loses its alert, and a
 * way back taken while the remove is pending.
 */

import { expect, it } from 'bun:test';

import { walkLists } from '../test/list-walk';

const FLOORS = [
  'practice:Learn',
  'practice:Open',
  'row',
  'back:list',
  'listen:from a list',
  'wake:home',
  'wake:list',
  'remove:Failed:once',
  'remove:Failed:with Your field',
];

it('learns, starts and refuses removes on lists as the model does', async () => {
  const { faults, reached } = await walkLists([53, 17, 44], 10);
  expect(faults).toEqual([]);
  expect(FLOORS.filter((floor) => !reached.has(floor))).toEqual([]);
});
