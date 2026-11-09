/**
 * Today's Listen against its model on generated devices
 * (`src/test/wake-walk.ts`, leaning toward Listen), the voice's source one
 * that reads until the walk ends it or refuses the speak: at every settle
 * Listen shows exactly where `listenModel` says (the new piece with Voice
 * on and nothing read; never on a review, at Next, in the done state, in an
 * unread garden or with Voice off; again after an unheard recital or a
 * refused write, and when Voice comes back on), and every Today frame holds
 * it before Say it alone, outside the scroll view. A tap reads the shown
 * piece's own text once, the passage another piece. Voice is chosen in the
 * Settings sheet, each tap's value shown there and its key on the disk,
 * and an unread launch offers no Voice. `src/wake/listen-b.test.tsx` walks
 * the refused speak, Next and the done state; `reading.test.tsx` and
 * `reading-b.test.tsx` the readings' ends.
 */

import { wakeCase } from '../test/wake-walk';

wakeCase('listen', 11, 2, [
  'listen:offered',
  'listen:read',
  'listen:not-passage',
  'listen:voice-on-fresh',
  'listen:fresh-voice-off',
  'listen:review-voice-on',
  'listen:after-unheard',
  'listen:after-refused',
  'listen:unread',
  'voice:tap',
  'wake:made',
  'listen:fresh-reading',
  'listen:end:interrupt',
  'listen:say-stops',
  'listen:voice-off-reading',
  'listen:minutes-reading',
  'listen:relaunch-reading',
  'settings:minutes',
  'voice:none-unread',
]);
