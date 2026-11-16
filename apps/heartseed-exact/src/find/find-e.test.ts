/**
 * Find against its model (`../test/find-check.ts`) at every keystroke of
 * the fixed list's second quarter (`find-d` says why).
 */

import { expect, it } from 'bun:test';

import { findFailures, typedQueries } from '../test/find-check';
import { FIXED } from './fixed';

it('answers what the model answers at every keystroke of the fixed list, second quarter, within the bounds', () => {
  expect(findFailures(typedQueries(FIXED.length / 4, FIXED.length / 2))).toEqual([]);
});
