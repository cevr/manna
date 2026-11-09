/**
 * Today's run against its model on generated devices, leaning toward whole
 * plans run item by item (`src/test/run-walk.ts`): each launch from home by
 * `Begin`, pieces in more than one group and devices without the passage
 * first, each item under its own cue (the new piece whole, a review in
 * first letters or empty slots, at the first show and after Next), each
 * kept recall's suggestion under that cue, and a recital cancelled. This
 * part runs the walk's first device, `src/run/cues-b.test.tsx` its second.
 */

import { walkCase } from '../test/run-walk';

walkCase('run', 14, 1, [
  'pieces:groups',
  'pieces:no-passage-first',
  'kept:cue:initials',
  'kept:cue:none',
  'cue:review:initials',
  'cue:review:none',
  'next:review:none',
  'say:cancelled',
  'home:begin',
]);
