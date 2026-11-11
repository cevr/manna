/**
 * Today's run against its model on generated devices with the host's state
 * sent, leaning toward the clocks (`src/test/wake-walk.ts`), a device
 * `src/wake/clocks.test.tsx` does not walk: a verse planted minutes before
 * the first launch (the new piece held back for the day), a garden with
 * nothing due, whose home shows the done state until an away's return
 * brings an item and `Start`, the launch's end on home, and a return, a
 * Minutes trip and a return again.
 */

import { wakeCase } from '../test/wake-walk';

wakeCase('clocks', 34, 1, [
  'wake:gap:minutes',
  'wake:gap:hours',
  'wake:gap:day',
  'wake:gap:month',
  'wake:many',
  'wake:return-minutes-return',
  'wake:made:differs',
  'wake:done-to-item',
  'disk:planted-today',
  'plan:nothing-due',
  'plan:fresh:planted today',
  'home:begin',
  'home:done',
  'home:away',
  'home:away-to-begin',
  'home:end',
  'settings:minutes',
  'wake:sheet-return',
]);
