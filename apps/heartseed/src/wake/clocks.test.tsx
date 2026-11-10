/**
 * Today's run against its model on generated devices with the host's state
 * sent, leaning toward the clocks (`src/test/wake-walk.ts`): returns minutes,
 * hours, a day, days and a month apart, many returns in one launch, a
 * return, a Minutes trip through the Settings sheet and a return again, a
 * return sent with the sheet open, zones every side of UTC (Lord Howe's
 * half-hour daylight saving among them), a plan the minutes chosen change,
 * a verse planted the evening before, and home in the done state until an
 * away's return brings an item and `Begin`. `src/wake/clocks-b.test.tsx`
 * walks the rest.
 */

import { wakeCase } from '../test/wake-walk';

wakeCase(
  'clocks',
  16,
  2,
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
    'home:begin',
    'home:done',
    'home:away',
    'home:away-to-begin',
    'settings:minutes',
    'wake:sheet-return',
    'end:one',
  ],
  3,
);
