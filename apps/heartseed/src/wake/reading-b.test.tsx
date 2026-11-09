/**
 * Listen's readings against the model on generated devices
 * (`src/test/wake-walk.ts`, leaning toward Listen), devices
 * `src/wake/reading.test.tsx` does not walk: a reading ends at its finish,
 * at Say it (the voice stopped once, before the recognizer listens), at
 * Voice off in the Settings sheet and at a relaunch, and goes on through a
 * Minutes trip through the sheet, the field, and a Voice trip from Her to
 * Him.
 */

import { wakeCase } from '../test/wake-walk';

wakeCase('listen', 32, 2, [
  'listen:offered',
  'listen:read',
  'listen:refused',
  'listen:voice-on-fresh',
  'listen:fresh-voice-off',
  'listen:review-voice-on',
  'listen:next-fresh',
  'listen:unread',
  'voice:tap',
  'wake:made',
  'listen:fresh-reading',
  'listen:end:finish',
  'listen:say-stops',
  'listen:voice-off-reading',
  'listen:minutes-reading',
  'listen:field-reading',
  'listen:relaunch-reading',
  'settings:minutes',
]);
