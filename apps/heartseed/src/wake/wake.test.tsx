/**
 * Today's run against its model on generated devices with the host's state
 * sent, leaning toward returns at every run state (`src/test/wake-walk.ts`): the
 * done state, a review shown, Next pending, after a refused write, on the
 * field, under each minutes choice and right after a Minutes tap; each
 * return makes the plan again and drops the hold, as the model does (with
 * the minutes chosen, where 5 would show another plan), and states that are
 * no return make nothing; the field in the done state leaves home showing
 * it, where an away and the launch's end follow; over gardens of one piece
 * to eight in groups, one-word and long pieces, the passage first or
 * absent, every piece planted, a plant no piece names, and crowded gardens
 * all due. `src/wake/returns.test.tsx` walks the rest of the returns.
 */

import { wakeCase } from '../test/wake-walk';

wakeCase('returns', 70, 2, [
  'wake:at:done',
  'wake:at:review',
  'wake:at:next',
  'wake:at:refused',
  'wake:made:differs',
  'wake:drops-hold',
  'wake:field',
  'wake:field:differs',
  'wake:minutes:2',
  'wake:minutes:20',
  'wake:minutes:differs',
  'wake:after-minutes',
  'wake:not-a-return:differs',
  'say:cancelled',
  'next',
  'again',
  'pieces:one',
  'pieces:many',
  'pieces:groups',
  'pieces:one-word',
  'pieces:long',
  'pieces:passage-first',
  'pieces:no-passage',
  'disk:all-planted',
  'disk:unnamed-plant',
  'disk:crowded',
  'done:field',
  'home:begin',
  'home:done',
  'home:away',
  'home:end',
]);
