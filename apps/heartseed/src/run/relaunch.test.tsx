/**
 * Today's run against its model on generated devices, leaning toward the
 * hold's moments (`src/test/run-walk.ts`): the field and back with a hold
 * and with none, a relaunch with a hold, unheard and refused recitals, long
 * pieces, and reviews under first letters and empty slots, at the first
 * show and after Next.
 */

import { walkCase } from '../test/run-walk';

walkCase('hold', 25, 2, [
  'field:held',
  'field:none',
  'relaunch:held',
  'say:unheard',
  'say:refused',
  'shown:long',
  'kept:cue:none',
  'cue:review:initials',
  'cue:review:none',
  'next:review:initials',
  'next:review:none',
]);
