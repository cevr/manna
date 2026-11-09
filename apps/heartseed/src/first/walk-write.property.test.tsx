/**
 * The root route against the first minute's model on generated devices
 * (`src/test/first-rig.tsx`), steered to the write floors: an alone write that lands,
 * is refused, meets a device going down or already down, and lands once it
 * recovers; a launch on a down device; and finished recitals on Today and
 * an unread Today, an unread Today's write landing. Today's run is
 * `walk-today`'s.
 */

import { walkPart } from '../test/first-rig';

walkPart('write', 5, 6);
