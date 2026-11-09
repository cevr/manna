/**
 * Today's counts line over the counts walk (`src/test/counts-walk.ts`):
 * four generated disks of the passage's history beside verses no piece
 * names, leaning on held launches, the new piece's line, refused recitals
 * and writes, and the field (and back, or in the done state).
 */

import { describe } from 'bun:test';

import { countsCase } from '../test/counts-walk';

describe('Today’s counts line', () => {
  countsCase(100, [2, 3, 4, 5], {
    held: 1,
    'counts:n new · about n min': 1,
    'say:refused': 1,
    'say:unwritten': 1,
    'field and back': 2,
    'field, done': 1,
    'other planted today': 1,
    'home:begin': 1,
    'home:done': 1,
  });
});
