/**
 * Today's Listen against its model on generated devices
 * (`src/test/wake-walk.ts`, leaning toward Listen), devices
 * `src/wake/listen.test.tsx` does not walk: a refused speak leaves Listen
 * and Say it; Listen shows on the new piece at Next and never in the done
 * state; Voice is chosen in the Settings sheet, Her to Him while a reading
 * goes on, Off stopping it.
 */

import { wakeCase } from '../test/wake-walk';

wakeCase('listen', 928, 2, [
  'listen:offered',
  'listen:read',
  'listen:refused',
  'listen:not-passage',
  'listen:voice-on-fresh',
  'listen:fresh-voice-off',
  'listen:review-voice-on',
  'listen:next-fresh',
  'listen:after-unheard',
  'listen:done',
  'listen:unread',
  'voice:tap',
  'wake:made',
  'listen:fresh-reading',
  'listen:say-stops',
  'listen:voice-off-reading',
  'listen:relaunch-reading',
  'settings:minutes',
  'end:one',
]);
