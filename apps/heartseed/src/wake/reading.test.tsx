/**
 * Listen's readings against the model on generated devices
 * (`src/test/wake-walk.ts`, leaning toward Listen): no Listen while one
 * reads; it ends at its finish or an interruption (Listen back), at Say it
 * (the voice stopped once, before the recognizer listens), at Voice off
 * (Listen gone) and at a relaunch (the voice stopped), and goes on through
 * a Minutes tap, a return and the field, as the voice's source shows.
 */

import { wakeCase } from '../test/wake-walk';

wakeCase('listen', 88, 4, [
  'listen:read',
  'listen:fresh-reading',
  'listen:end:finish',
  'listen:end:interrupt',
  'listen:say-stops',
  'listen:voice-off-reading',
  'listen:minutes-reading',
  'listen:return-reading',
  'listen:field-reading',
  'listen:relaunch-reading',
]);
