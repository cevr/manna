/**
 * Today's run against its model on generated devices with the host's state
 * sent, leaning toward returns at every run state (`src/test/wake-walk.ts`):
 * a review shown, Next pending, after an unheard recital, on the field,
 * under 2 and 20 minutes chosen by a Minutes trip through the Settings
 * sheet; each return makes the plan again and drops the hold, as the model
 * does (with the minutes chosen, where 5 would show another plan), and
 * states that are no return make nothing; over a crowded garden all due,
 * of many pieces in groups, long ones among them. `src/wake/wake-b.test.tsx`,
 * `returns.test.tsx` and `returns-b.test.tsx` walk the rest of the returns.
 */

import { wakeCase } from '../test/wake-walk';

wakeCase('returns', 1, 1, [
  'wake:at:review',
  'wake:at:next',
  'wake:at:unheard',
  'wake:made:differs',
  'wake:drops-hold',
  'wake:field',
  'wake:field:differs',
  'wake:minutes:2',
  'wake:minutes:20',
  'wake:minutes:differs',
  'wake:not-a-return:differs',
  'next',
  'again',
  'pieces:many',
  'pieces:groups',
  'pieces:long',
  'pieces:no-passage',
  'disk:crowded',
  'home:begin',
  'settings:minutes',
]);
