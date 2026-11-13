/**
 * The root route against the first minute's model on generated devices
 * (`src/test/first-rig.tsx`), steered to Today's run floors: `Start` from
 * home, a finished recital on Today whose recall waits for Next, Next
 * writing it, the done state, the end of the run with a verse grown, and a
 * new plan made there at the passage's due.
 */

import { walkPart } from '../test/first-rig';

walkPart('today', 120, 3);
