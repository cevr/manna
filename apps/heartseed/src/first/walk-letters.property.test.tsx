/**
 * The root route against the first minute's model on generated devices
 * (`src/test/first-rig.tsx`), steered to the letters floors: every ending Dictation
 * gives a letters recital, and finished ones with no word, some or every
 * word missed.
 */

import { walkPart } from '../test/first-rig';

walkPart('letters', 12, 5);
