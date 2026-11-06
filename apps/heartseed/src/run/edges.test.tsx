/**
 * Today's run against its model on generated devices, leaning toward its
 * edges (`src/test/run-walk.ts`): the first minute and the done state after
 * Continue, a done state at the first show, after a Minutes tap and after
 * the field, a verse that comes due at a Minutes tap, unread launches whose
 * recitals of the first piece are all written, and three or more zones.
 */

import { walkCase } from '../test/run-walk';

walkCase(
  'edges',
  1,
  4,
  [
    'first-minute',
    'done:first-show',
    'done:after-minutes',
    'done:field',
    'minutes:appears',
    'launch:unread',
    'say:unread',
    'wait',
    'kept:cue:full',
    'cue:fresh:full',
    'cue:review:initials',
  ],
  3,
);
