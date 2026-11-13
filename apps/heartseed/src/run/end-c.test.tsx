/**
 * The endings walk's third device (`src/run/end.test.tsx` runs the first
 * and `src/run/end-b.test.tsx` the second, so each part keeps under its
 * budget): recitals heard and refused, a Minutes trip dropping a hold,
 * reviews under first letters and empty slots, and Next.
 */

import { walkCase } from '../test/run-walk';

walkCase('end', 30, 1, [
  'say:heard',
  'say:refused',
  'made:drops-hold',
  'cue:review:initials',
  'cue:review:none',
  'next',
  'end:one',
]);
