/**
 * Today's run against its model on generated devices with the host's state
 * sent, leaning toward returns at every run state (`src/test/wake-walk.ts`),
 * a device the other returns cases do not walk: the done state turned to an
 * item by a return, the field in the done state leaving home showing it,
 * where an away and the launch's end follow, a Minutes trip followed by a
 * return, the passage first and every piece planted.
 */

import { wakeCase } from '../test/wake-walk';

wakeCase('returns', 388031, 1, [
  'wake:at:done',
  'wake:at:review',
  'wake:at:next',
  'wake:at:unheard',
  'wake:made:differs',
  'wake:drops-hold',
  'wake:field',
  'wake:done-to-item',
  'wake:minutes:2',
  'wake:minutes:5',
  'wake:minutes:20',
  'wake:after-minutes',
  'next',
  'pieces:one',
  'pieces:passage-first',
  'disk:all-planted',
  'done:field',
  'home:begin',
  'home:done',
  'home:away',
  'home:end',
  'settings:minutes',
]);
