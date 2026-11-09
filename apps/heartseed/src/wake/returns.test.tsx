/**
 * Today's run against its model on generated devices with the host's state
 * sent, leaning toward returns at every run state (`src/test/wake-walk.ts`),
 * a device `src/wake/wake.test.tsx` does not walk: the new piece shown,
 * after a cancelled recital, 5 and 10 minutes chosen, a return and a
 * sequence that is none sent with the Settings sheet open on home (the
 * sheet stays, the plan made again under it at the return), a return under
 * the open sheet whose new plan moves home's counts
 * (`wake:sheet-return-differs`), a Minutes trip followed by a return, and a
 * plant no piece names; each launch takes home's `Begin` to Today.
 */

import { wakeCase } from '../test/wake-walk';

wakeCase('returns', 245489, 1, [
  'wake:at:review',
  'wake:at:next',
  'wake:at:fresh',
  'wake:made:differs',
  'wake:drops-hold',
  'wake:minutes:2',
  'wake:minutes:5',
  'wake:minutes:10',
  'wake:minutes:20',
  'wake:after-minutes',
  'wake:not-a-return:differs',
  'say:cancelled',
  'next',
  'again',
  'pieces:one',
  'pieces:no-passage',
  'disk:unnamed-plant',
  'home:begin',
  'settings:minutes',
  'wake:sheet-return',
  'wake:sheet-return-differs',
  'wake:sheet-quiet',
]);
