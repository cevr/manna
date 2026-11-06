/**
 * Today's Listen against its model on generated devices
 * (`src/test/wake-walk.ts`, leaning toward Listen), the voice's source one
 * that reads until the walk ends it or refuses the speak: at every settle
 * Listen shows exactly where `listenModel` says (the new piece with Voice
 * on and nothing read; never on a review, at Next, in the done state, in an
 * unread garden or with Voice off; again after an unheard recital or a
 * refused write, and when Voice comes back on), and every Today frame holds
 * it before Say it alone, outside the scroll view. A tap reads the shown
 * piece's own text once, the passage another piece; a refused speak leaves
 * Listen and Say it. The disk holds the voice's switch after a Voice tap,
 * and nothing more for a Listen. `src/wake/reading.test.tsx` walks the
 * readings' ends.
 */

import { wakeCase } from '../test/wake-walk';

wakeCase('listen', 46, 4, [
  'listen:offered',
  'listen:read',
  'listen:refused',
  'listen:not-passage',
  'listen:voice-on-fresh',
  'listen:fresh-voice-off',
  'listen:review-voice-on',
  'listen:next-fresh',
  'listen:after-unheard',
  'listen:after-refused',
  'listen:done',
  'listen:unread',
  'voice:tap',
  'wake:made',
]);
