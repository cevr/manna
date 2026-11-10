/**
 * Today's counts line over the counts walk (`src/test/counts-walk.ts`):
 * two generated disks of the passage's history beside verses no piece
 * names (devices 4 and 5, beside `counts-b.test.tsx`'s), leaning on held
 * launches, the new piece's line, refused recitals, the end of a run with
 * one verse grown, and the field in its done state.
 */

import { describe } from 'bun:test';

import { countsCase } from '../test/counts-walk';

describe('Today’s counts line', () => {
  countsCase(91, [4, 5], {
    held: 1,
    'counts:n new · about n min': 1,
    'say:refused': 1,
    'field, done': 1,
    'home:begin': 1,
    'home:done': 1,
    'end:one': 1,
  });
});
