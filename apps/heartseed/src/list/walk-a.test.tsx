/* oxlint-disable effect/noAsyncFunction -- the walk drives the root through React's promise-based `act`, one awaited tap at a time. */

/**
 * The lists' own pages walked through the root (`test/list-walk.tsx`), part
 * a: three generated readers (seeds 58, 23 and 57, ten commands each) open
 * lists from home, go back, practise a list, tap its rows, start Say it
 * from a page, return to the foreground, and remove a held list or keep
 * it, each step against the walk's model and every frame against the
 * rules. Its floors: a held list and another opened, `Practice this list`
 * over a list's open items and over its weakest verse, a tap on a list's
 * first row, `Your
 * field` from a page and from Today, Say it listening from a page, a
 * return to the foreground on home and on a page, and a remove kept,
 * landed (once, twice in one turn, and with `Your field` in its turn) and
 * refused twice in one turn.
 *
 * It catches `Practice this list` starting anything but what
 * `listStartOf` gives (the whole plan, say), a removed list's row left on home, a page kept while Say it
 * listens, and a control live beside a disabled one while a remove is
 * pending.
 */

import { expect, it } from 'bun:test';

import { walkLists } from '../test/list-walk';

const FLOORS = [
  'open:held',
  'open:other',
  'practice:Open',
  'practice:Weakest',
  'row:first',
  'back:list',
  'back:Today',
  'listen:from a list',
  'wake:home',
  'wake:list',
  'remove:Keep',
  'remove:Removed:once',
  'remove:Removed:twice',
  'remove:Removed:with Your field',
  'remove:Failed:twice',
];

it('opens, practises, starts and removes lists as the model does', async () => {
  const { faults, reached } = await walkLists([58, 23, 57], 10);
  expect(faults).toEqual([]);
  expect(FLOORS.filter((floor) => !reached.has(floor))).toEqual([]);
});
