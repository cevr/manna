/**
 * Today's run against its model on generated devices, leaning toward its
 * edges on Today (`src/test/run-walk.ts`): a launch taken from home to
 * Today by `Start`, then the done state after a Minutes trip through home's
 * Settings sheet and after the field (home in the done state, the launch
 * ending there), and a verse that comes due at a trip's Minutes tap.
 */

import { walkCase } from '../test/run-walk';

walkCase('edges', 14, 2, [
  'done:after-minutes',
  'done:field',
  'end:none',
  'end:one',
  'minutes:appears',
  'home:begin',
  'cue:review:initials',
  'settings:minutes',
]);
