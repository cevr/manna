/**
 * The root route against the first minute's model on generated devices
 * (`src/test/first-rig.tsx`), steered to the write floors: an alone write that lands,
 * is refused, meets a device going down or already down, and lands once it
 * recovers; a launch on a down device; and finished recitals on Today and an
 * unread Today whose writes land.
 */

import { walkPart } from '../test/first-rig';

walkPart('write', 5, 5);
