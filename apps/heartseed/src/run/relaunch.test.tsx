/**
 * Today's run against its model on generated devices, leaning toward the
 * hold's moments (`src/test/run-walk.ts`): the field and back with a hold
 * (one the model shows again once it lets it go among them) and with none, a relaunch with a hold, unheard and refused recitals, long
 * pieces, and reviews under first letters and empty slots, at the first
 * show and after Next. This part runs the walk's first device,
 * `src/run/relaunch-b.test.tsx` its second.
 */

import { walkCase } from '../test/run-walk';

walkCase('hold', 27, 1, [
  'field:held',
  'field:held:again',
  'field:none',
  'relaunch:held',
  'say:unheard',
  'shown:long',
  'kept:cue:none',
  'cue:review:initials',
  'cue:review:none',
  'next:review:none',
]);
