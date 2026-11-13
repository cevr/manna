/**
 * Today's run against its model on generated devices with the host's state
 * sent, leaning toward returns at every run state (`src/test/wake-walk.ts`),
 * a device `src/wake/wake.test.tsx` does not walk, floored on what no other
 * wake part floors: the new piece shown, after a cancelled recital, 5 and
 * 10 minutes chosen, a sequence that is none sent with the Settings sheet
 * open on home (the sheet stays), a Minutes trip followed by a return, one
 * piece and a plant no piece names; each launch takes home's `Start` to
 * Today.
 */

import { wakeCase } from '../test/wake-walk';

wakeCase('returns', 8398, 1, [
  'wake:at:fresh',
  'wake:minutes:5',
  'wake:minutes:10',
  'wake:after-minutes',
  'say:cancelled',
  'pieces:one',
  'disk:unnamed-plant',
  'wake:sheet-quiet',
]);
