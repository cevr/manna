/**
 * The root route against the first minute's model on generated devices
 * (`src/test/first-rig.tsx`), steered to the reading floors: every kind of range (the
 * next word, two, ahead, behind, stale, outside the verse), the voice's
 * finish, interruption and cancel, and a stale event of another reading.
 */

import { walkPart } from '../test/first-rig';

walkPart('reading', 1, 5);
