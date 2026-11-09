/**
 * Today's run against its model on generated devices, leaning toward whole
 * plans run item by item (`src/test/run-walk.ts`): each launch from home by
 * `Begin`, many pieces in their mixed order, Next to another group and to
 * the done state, every recital's ending, and Again before Next. Each item
 * under its own cue is `src/run/cues.test.tsx`'s.
 */

import { walkCase } from '../test/run-walk';

walkCase('run', 5, 2, [
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
  'home:begin',
]);
