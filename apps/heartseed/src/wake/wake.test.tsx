/**
 * Today's run against its model on generated devices with the host's state
 * sent, leaning toward returns at every run state (`src/wake/walk.ts`): the
 * done state, a review and the new piece shown, Next pending, after an
 * unheard recital and a refused write, on the field, under each minutes
 * choice and right after a Minutes tap; each return makes the plan again
 * and drops the hold, as the model does (with the minutes chosen, where 5
 * would show another plan), and states that are no return make nothing;
 * over gardens of one piece to eight in groups, one-word and long pieces,
 * the passage first or absent, every piece planted, a plant no piece
 * names, and crowded gardens all due.
 */

import { wakeCase } from '../test/wake-walk';

wakeCase('returns', 17, 4, [
  'wake:at:done',
  'wake:at:review',
  'wake:at:fresh',
  'wake:at:next',
  'wake:at:unheard',
  'wake:at:refused',
  'wake:made:differs',
  'wake:drops-hold',
  'wake:done-to-item',
  'wake:field',
  'wake:field:differs',
  'wake:minutes:2',
  'wake:minutes:5',
  'wake:minutes:10',
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
  'plan:fresh-and-review',
]);
