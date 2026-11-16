/**
 * Find against its model (`../test/find-check.ts`) at every keystroke of
 * the fixed list's last quarter (`find-d` says why).
 */

import { expect, it } from 'bun:test';

import { findFailures, typedQueries } from '../test/find-check';
import { FIXED } from './fixed';

it('answers what the model answers at every keystroke of the fixed list, last quarter, within the bounds', () => {
  expect(findFailures(typedQueries((FIXED.length * 3) / 4, FIXED.length))).toEqual([]);
});
