/**
 * Today's run against its model on generated devices, leaning toward the
 * hold's moments (`src/test/run-walk.ts`): a Minutes tap while a recital
 * listens or finishes, whose new plan holds the item first, later or not at
 * all (a short plan over long pieces, crowded devices among them), and a
 * Minutes tap with a result shown or after an unheard recital. The field
 * and back and a relaunch with a hold are `src/run/relaunch.test.tsx`'s.
 */

import { walkCase } from '../test/run-walk';

walkCase('hold', 45, 2, [
  'held:minutes',
  'held:minutes:first',
  'held:minutes:left-out',
  'made:held-not-first',
  'made:drops-hold',
  'made:drops-hold:unheard',
  'held:minutes:listening',
  'held:minutes:finishing',
]);
