/**
 * The root route against the first minute's model on generated devices
 * (`src/test/first-rig.tsx`), steered to the tap floors: a refused speak, Next during
 * a reading, the queued tap orders of Listen and Next, and the voice's late
 * events once hear is gone.
 */

import { walkPart } from '../test/first-rig';

walkPart('taps', 37, 5);
