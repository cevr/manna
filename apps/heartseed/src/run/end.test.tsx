/**
 * Today's run against its model on generated devices, leaning toward the
 * recital's endings (`src/test/run-walk.ts`): recitals cancelled while they
 * listen, and a Minutes trip through home's Settings sheet right after
 * each ending that kept nothing (unheard, refused, cancelled), each checked
 * for the hold, the action, the result and the disk. A making while a
 * recital listens or finishes is `src/session/cells.property.test.ts`'s.
 * This part runs the walk's first device, `src/run/end-b.test.tsx` and
 * `src/run/end-c.test.tsx` its second and third.
 */

import { walkCase } from '../test/run-walk';

walkCase('end', 32, 1, [
  'say:heard',
  'say:unheard',
  'say:refused',
  'say:cancelled',
  'minutes:after:unheard',
  'minutes:after:refused',
  'minutes:after:cancelled',
  'made:drops-hold',
  'cue:review:none',
  'next',
]);
