/**
 * Today's run against its model on generated devices, leaning toward the
 * hold's moments (`src/test/run-walk.ts`): a Minutes tap while a recital
 * listens or finishes, whose new plan holds the item first, later or not at
 * all (a short plan over long pieces, crowded devices among them), a
 * Minutes tap with a result shown or after an
 * unheard recital, the field and back with a hold and with none, and a
 * relaunch with a hold.
 */

import { walkCase } from '../test/run-walk';

walkCase('hold', 45, 3, [
  'held:minutes',
  'held:minutes:first',
  'held:minutes:left-out',
  'made:held-not-first',
  'made:drops-hold',
  'made:drops-hold:unheard',
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
  'held:minutes:listening',
  'held:minutes:finishing',
]);
