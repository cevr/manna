/**
 * Today's counts line over the counts walk (`src/test/counts-walk.ts`):
 * two generated disks (devices 2 and 3) beside `counts.test.tsx`'s fresh
 * installs, leaning on the evening's history, a launch before the
 * morning's rollover and a month passing.
 */

import { describe } from 'bun:test';

import { countsCase } from '../test/counts-walk';

describe('Today’s counts line', () => {
  countsCase(287, [2, 3], {
    'history:evening': 2,
    'launch at morning -1': 1,
    'later:month': 1,
    'home:begin': 1,
    'home:done': 1,
  });
});
