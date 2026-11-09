/**
 * Today's counts line over the counts walk (`src/test/counts-walk.ts`):
 * two generated disks (devices 4 and 5, beside `counts-c.test.tsx`'s),
 * leaning on a Minutes choice made in the Settings sheet after a recital,
 * a missed recital, a launch at the morning's rollover, and the trips that
 * end on home's done state.
 */

import { describe } from 'bun:test';

import { countsCase } from '../test/counts-walk';

describe('Today’s counts line', () => {
  countsCase(225, [4, 5], {
    'say:then-minutes': 1,
    'say:missed': 1,
    'launch at morning 0': 1,
    'trip ended on home': 3,
    'home:begin': 1,
    'home:done': 1,
  });
});
