/**
 * Today's run against its model on generated devices, leaning toward the
 * recital's endings (`src/test/run-walk.ts`): recitals cancelled while they
 * listen, a Minutes tap while a recital listens and while it finishes (its
 * end held back), and a Minutes tap right after each ending that kept
 * nothing (unheard, refused, cancelled), each checked for the hold, the
 * action, the result and the disk.
 */

import { walkCase } from '../test/run-walk';

walkCase('end', 4, 3, [
  'say:heard',
  'say:unheard',
  'say:refused',
  'say:cancelled',
  'held:minutes:listening',
  'held:minutes:finishing',
  'minutes:after:unheard',
  'minutes:after:refused',
  'minutes:after:cancelled',
  'made:drops-hold',
  'cue:review:initials',
  'cue:review:none',
  'next',
]);
