/**
 * Today's run against its model on generated devices, leaning toward the
 * hold's moments (`src/run/walk.ts`): a Minutes tap while a recital
 * listens, whose new plan holds the item first, later or not at all (2
 * minutes over long pieces), a Minutes tap with a result shown or after an
 * unheard recital, the field and back with a hold and with none, and a
 * relaunch with a hold.
 */

import { walkCase } from '../test/run-walk';

walkCase('hold', 34, 3, [
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
]);
