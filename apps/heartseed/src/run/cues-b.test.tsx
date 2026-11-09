/**
 * The cues walk's second device (`src/run/cues.test.tsx` runs the first, so
 * each part keeps under its budget): a device without the passage first,
 * each item under its own cue (the new piece whole, a review in first
 * letters or empty slots, at the first show and after Next), and each kept
 * recall's suggestion under that cue.
 */

import { walkCase } from '../test/run-walk';

walkCase('run', 36, 1, [
  'pieces:no-passage-first',
  'kept:cue:full',
  'kept:cue:initials',
  'kept:cue:none',
  'cue:fresh:full',
  'cue:review:initials',
  'cue:review:none',
  'next:review:initials',
  'home:begin',
]);
