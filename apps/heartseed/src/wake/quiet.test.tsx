/**
 * Today's run against its model on generated devices with the host's state
 * sent, leaning toward the returns that change nothing (`src/wake/walk.ts`):
 * a return or a sequence that is none while a recital listens and, its end
 * held back, while it finishes (the recital goes on, its item stays held,
 * no plan is made), states sent in each phase of the first minute, returns
 * in unread launches with a result shown and with none, and `inactive`
 * alone or a second `active` wherever a making would show another screen.
 */

import { wakeCase } from '../test/wake-walk';

wakeCase('quiet', 50, 4, [
  'wake:under-way',
  'wake:under-way:differs',
  'held:return',
  'held:finishing-return',
  'held:quiet:listening',
  'held:quiet:finishing',
  'held:minutes:listening',
  'wake:not-a-return:differs',
  'wake:unread',
  'wake:unread:result',
  'wake:first:Hear it',
  'wake:first:Say it with help',
  'wake:first:Say it alone',
  'wake:first:Planted',
  'launch:background',
  'pieces:one-word',
  'pieces:long',
]);
