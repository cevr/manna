/**
 * Today's run against its model on generated devices, leaning toward its
 * edges on Today (`src/test/run-walk.ts`): a launch taken from home to
 * Today by `Begin`, then Today's done state after a Minutes tap and after
 * the field (home in the done state, the launch ending there), and a verse
 * that comes due at a Minutes tap.
 */

import { walkCase } from '../test/run-walk';

walkCase('edges', 50, 2, [
  'done:after-minutes',
  'done:field',
  'minutes:appears',
  'home:begin',
  'cue:review:initials',
]);
