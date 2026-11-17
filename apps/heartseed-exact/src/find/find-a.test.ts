/**
 * Find against its model (`../test/find-check.ts`): the first third of the
 * queries drawn by seed. `find-b` and `find-c` run the rest of them, and
 * `find-d` to `find-g` the fixed list a keystroke at a time, a quarter
 * each; so each part runs alone in under a second.
 */

import { expect, it } from 'bun:test';

import { DRAWN, drawnQueries, findFailures } from '../test/find-check';

it('answers what the model answers over the first third of the drawn queries, within the bounds', () => {
  expect(findFailures(drawnQueries(0, DRAWN / 3))).toEqual([]);
});
