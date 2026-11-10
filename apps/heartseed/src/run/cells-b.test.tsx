/**
 * The cells walk's second device (`src/run/cells.test.tsx` runs the first,
 * meeting every cell, and `src/run/cells-c.test.tsx` the third, so each
 * part keeps under its budget): a Minutes trip after a heard recital, and
 * after an unheard and a cancelled one with the held item first again.
 */

import { walkCase } from '../test/run-walk';

walkCase('cells', 2, 1, [
  'cell:after:heard:moved',
  'cell:after:unheard:kept',
  'cell:after:cancelled:kept',
  'settings:minutes',
  'end:one',
]);
