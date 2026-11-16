/**
 * Find against its model (`../test/find-check.ts`) over the first quarter
 * of the fixed list the speed drive types (`fixed.ts`), every keystroke a
 * query from a cold index: the one- and two-letter prefixes and the stop
 * words typed first are the worst the work bound meets. `find-e` to
 * `find-g` run the other quarters.
 */

import { expect, it } from 'bun:test';

import { findFailures, typedQueries } from '../test/find-check';
import { FIXED } from './fixed';

it('answers what the model answers at every keystroke of the fixed list, first quarter, within the bounds', () => {
  expect(findFailures(typedQueries(0, FIXED.length / 4))).toEqual([]);
});
