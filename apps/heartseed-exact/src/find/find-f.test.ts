/**
 * Find against its model (`../test/find-check.ts`) at every keystroke of
 * the fixed list's third quarter (`find-d` says why).
 */

import { expect, it } from 'bun:test';

import { findFailures, typedQueries } from '../test/find-check';
import { FIXED } from './fixed';

it('answers what the model answers at every keystroke of the fixed list, third quarter, within the bounds', () => {
  expect(findFailures(typedQueries(FIXED.length / 2, (FIXED.length * 3) / 4))).toEqual([]);
});
