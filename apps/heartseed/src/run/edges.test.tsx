/**
 * Today's run against its model on generated devices, leaning toward its
 * edges at a launch (`src/test/run-walk.ts`): the first minute and home
 * after Continue, a done state at home's first show (the launch ending on
 * home with no `Begin`), unread launches whose recitals of the first piece
 * are all written and which offer no Minutes and no Settings, and three or
 * more zones. Today's own done state is
 * `src/run/done.test.tsx`'s.
 */

import { walkCase } from '../test/run-walk';

walkCase(
  'edges',
  22,
  2,
  [
    'first-minute',
    'done:first-show',
    'home:done',
    'end:one',
    'launch:unread',
    'say:unread',
    'minutes:none-unread',
    'wait',
    'kept:cue:full',
    'cue:fresh:full',
  ],
  3,
);
