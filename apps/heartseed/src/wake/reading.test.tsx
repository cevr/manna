/**
 * Listen's readings against the model on generated devices
 * (`src/test/wake-walk.ts`, leaning toward Listen): no Listen while one
 * reads; it ends at its finish or an interruption (Listen back), at Voice
 * off in the Settings sheet (Listen gone) and at a relaunch (the voice
 * stopped), and goes on through a return and through a Voice trip from Her
 * to Him, as the voice's source shows. `src/wake/reading-b.test.tsx` walks
 * Say it, a Minutes trip and the field while one reads
 * (`src/wake/returns-b.test.tsx` walks the field in the done state).
 */

import { wakeCase } from '../test/wake-walk';

wakeCase('listen', 29, 2, [
  'listen:offered',
  'listen:read',
  'listen:refused',
  'listen:not-passage',
  'listen:fresh-voice-off',
  'listen:review-voice-on',
  'listen:after-unheard',
  'voice:tap',
  'wake:made',
  'listen:fresh-reading',
  'listen:end:finish',
  'listen:end:interrupt',
  'listen:voice-off-reading',
  'listen:return-reading',
  'listen:relaunch-reading',
  'settings:minutes',
]);
