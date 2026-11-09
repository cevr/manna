/**
 * Today's run against its model on generated devices with the host's state
 * sent, leaning toward returns at every run state (`src/test/wake-walk.ts`),
 * the devices `src/wake/wake.test.tsx` does not walk: the new piece shown,
 * after an unheard recital, the done state turned to an item by a return,
 * and 5 and 10 minutes chosen, over a plan of a new piece and reviews; each
 * launch takes home's `Begin` to Today.
 */

import { wakeCase } from '../test/wake-walk';

wakeCase('returns', 113, 2, [
  'wake:at:done',
  'wake:at:review',
  'wake:at:fresh',
  'wake:at:unheard',
  'wake:at:refused',
  'wake:made:differs',
  'wake:drops-hold',
  'wake:done-to-item',
  'wake:minutes:2',
  'wake:minutes:5',
  'wake:minutes:10',
  'wake:minutes:20',
  'wake:after-minutes',
  'wake:not-a-return:differs',
  'say:cancelled',
  'next',
  'again',
  'pieces:many',
  'pieces:long',
  'pieces:no-passage',
  'disk:crowded',
  'plan:fresh-and-review',
  'home:begin',
]);
