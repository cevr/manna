/**
 * Today's run against its model on generated devices with the host's state
 * sent, leaning toward the returns that change nothing (`src/test/wake-walk.ts`),
 * devices `src/wake/quiet.test.tsx` does not walk: a return while a recital
 * listens where a making would show another plan, states sent in each
 * phase of the first minute, a launch in the background, returns in unread
 * launches, an unread launch offering no choices, and one-word and long
 * pieces.
 */

import { wakeCase } from '../test/wake-walk';

wakeCase('quiet', 3827, 2, [
  'wake:under-way',
  'wake:under-way:differs',
  'held:return',
  'held:quiet:finishing',
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
  'settings:minutes',
  'minutes:none-unread',
  'end:one',
]);
