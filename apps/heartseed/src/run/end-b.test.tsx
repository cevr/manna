/**
 * The endings walk's second device (`src/run/end.test.tsx` runs the first
 * and `src/run/end-c.test.tsx` the third, so each part keeps under its
 * budget): recitals heard, unheard and cancelled, a Minutes trip right
 * after an unheard and a cancelled one, the field and back with an item
 * held at `Next` and another open after it, and reviews under first
 * letters and empty slots.
 */

import { walkCase } from '../test/run-walk';

walkCase('end', 33, 1, [
  'say:heard',
  'say:unheard',
  'say:cancelled',
  'minutes:after:unheard',
  'minutes:after:cancelled',
  'made:drops-hold',
  'field:held:next:more',
  'cue:review:initials',
  'cue:review:none',
]);
