/**
 * The cells walk's third device (`src/run/cells.test.tsx` runs the first,
 * meeting every cell, and `src/run/cells-b.test.tsx` the second, so each
 * part keeps under its budget): a Minutes trip after a heard recital, and
 * after an unheard and a cancelled one with the held item first again.
 */

import { walkCase } from '../test/run-walk';

walkCase('cells', 16, 1, [
  'cell:after:heard:moved',
  'cell:after:unheard:kept',
  'cell:after:cancelled:kept',
  'settings:minutes',
]);
