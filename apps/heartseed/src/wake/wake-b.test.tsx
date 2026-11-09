/**
 * Today's run against its model on generated devices with the host's state
 * sent, leaning toward returns at every run state (`src/test/wake-walk.ts`),
 * a device `src/wake/wake.test.tsx` does not walk: after a refused write,
 * a return sent with the Settings sheet open on home, which makes the plan
 * again under it and leaves the sheet showing, and a plan of a new piece
 * and reviews over one-word pieces.
 */

import { wakeCase } from '../test/wake-walk';

wakeCase('returns', 31676, 1, [
  'wake:at:review',
  'wake:at:next',
  'wake:at:refused',
  'wake:made:differs',
  'wake:drops-hold',
  'wake:minutes:2',
  'wake:not-a-return:differs',
  'next',
  'again',
  'pieces:many',
  'pieces:one-word',
  'pieces:no-passage',
  'home:begin',
  'plan:fresh-and-review',
  'settings:minutes',
  'wake:sheet-return',
]);
