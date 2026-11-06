/**
 * Today's run against its model on generated devices, leaning toward whole
 * plans run item by item (`src/test/run-walk.ts`): many pieces in their mixed
 * order, Next to another group and to the done state, every recital's
 * ending, Again and peeks before Next.
 */

import { walkCase } from '../test/run-walk';

walkCase('run', 14, 4, [
  'next',
  'next:another-group',
  'done:after-next',
  'shown:fresh',
  'shown:review',
  'say:heard',
  'say:skipped',
  'say:refused',
  'say:unheard',
  'again',
  'pieces:many',
  'pieces:groups',
  'pieces:no-passage-first',
  'kept:cue:initials',
  'kept:cue:none',
]);
