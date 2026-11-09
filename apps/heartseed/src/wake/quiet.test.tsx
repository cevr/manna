/**
 * Today's run against its model on generated devices with the host's state
 * sent, leaning toward the returns that change nothing (`src/test/wake-walk.ts`):
 * a return or a sequence that is none while a recital listens and, its end
 * held back, while it finishes (the recital goes on, its item stays held,
 * no plan is made), returns in unread launches with a result shown, an
 * unread launch offering no Settings, Voice or Minutes, a Minutes trip
 * after a recital, and `inactive` alone or a second `active` wherever a
 * making would show another screen. A Minutes choice while a recital
 * listens, which no reader reaches, is `test:session-cells`'.
 * `src/wake/quiet-b.test.tsx` walks the rest.
 */

import { wakeCase } from '../test/wake-walk';

wakeCase('quiet', 1, 2, [
  'wake:under-way',
  'held:finishing-return',
  'held:quiet:listening',
  'held:quiet:finishing',
  'wake:not-a-return:differs',
  'wake:unread',
  'wake:unread:result',
  'pieces:long',
  'settings:minutes',
  'minutes:none-unread',
]);
