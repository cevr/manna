/**
 * Today's run against its model on generated devices with the host's state
 * sent, leaning toward the clocks (`src/wake/walk.ts`): returns minutes,
 * hours, a day, days and a month apart, many returns in one launch, a
 * return, a Minutes tap and a return again, zones every side of UTC (Lord
 * Howe's half-hour daylight saving among them), a plan the minutes chosen
 * change, verses planted the evening before and minutes before (the new
 * piece held back for the day), and a garden with nothing due, whose home
 * shows the done state until an away's return brings an item and `Begin`.
 */

import { wakeCase } from '../test/wake-walk';

wakeCase(
  'clocks',
  100,
  3,
  [
    'wake:gap:minutes',
    'wake:gap:hours',
    'wake:gap:day',
    'wake:gap:days',
    'wake:gap:month',
    'wake:many',
    'wake:minutes:differs',
    'wake:return-minutes-return',
    'wake:made:differs',
    'wake:done-to-item',
    'disk:first-evening',
    'disk:planted-today',
    'plan:nothing-due',
    'plan:fresh:planted today',
    'home:begin',
    'home:done',
    'home:away',
    'home:away-to-begin',
    'home:end',
  ],
  3,
);
