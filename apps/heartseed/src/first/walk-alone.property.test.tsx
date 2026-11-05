/**
 * The root route against the first minute's model on generated devices
 * (`src/test/first-rig.tsx`), steered to the alone floors: every ending Dictation
 * gives an alone recital, finished ones with no word, some or every word
 * missed, a peek, a second tap of Say it before a render, and Continue from
 * Planted.
 */

import { walkPart } from '../test/first-rig';

walkPart('alone', 1, 5);
