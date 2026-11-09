/**
 * Today's counts line over the counts walk (`src/test/counts-walk.ts`):
 * two generated disks of the passage's history beside verses no piece
 * names (devices 2 and 3), leaning on refused writes, the field and back,
 * and a Minutes choice made in the Settings sheet. Devices 4 and 5, with
 * the held launches, the new piece's line, refused recitals and the
 * field's done state, are `counts-e.test.tsx`'s.
 */

import { describe } from 'bun:test';

import { countsCase } from '../test/counts-walk';

describe('Today’s counts line', () => {
  countsCase(293, [2, 3], {
    'say:unwritten': 1,
    'field and back': 2,
    'other planted today': 1,
    'home:begin': 1,
    'home:done': 1,
    'settings:minutes': 1,
  });
});
