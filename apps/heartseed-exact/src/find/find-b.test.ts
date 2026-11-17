/**
 * Find against its model (`../test/find-check.ts`): the second third of
 * the queries drawn by seed (`find-a` says how the parts divide).
 */

import { expect, it } from 'bun:test';

import { DRAWN, drawnQueries, findFailures } from '../test/find-check';

it('answers what the model answers over the second third of the drawn queries, within the bounds', () => {
  expect(findFailures(drawnQueries(DRAWN / 3, (DRAWN * 2) / 3))).toEqual([]);
});
