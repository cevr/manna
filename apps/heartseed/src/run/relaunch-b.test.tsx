/**
 * The relaunch walk's second device (`src/run/relaunch.test.tsx` runs the
 * first, so each part keeps under its budget): the field and back with no
 * hold, a relaunch with a hold, unheard and refused recitals, long pieces,
 * and reviews under first letters and empty slots, at the first show and
 * after Next.
 */

import { walkCase } from '../test/run-walk';

walkCase('hold', 17, 1, [
  'field:none',
  'relaunch:held',
  'say:unheard',
  'say:refused',
  'shown:long',
  'cue:review:initials',
  'cue:review:none',
  'next:review:initials',
]);
