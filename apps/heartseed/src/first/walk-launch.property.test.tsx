/**
 * The root route against the first minute's model on generated devices
 * (`src/test/first-rig.tsx`), steered to the launch floors: a read at once, after one
 * or two failed listings and unread, a launch held before its read, the
 * voice off, and each screen a launch opens (hear, home, an unread Today).
 */

import { walkPart } from '../test/first-rig';

walkPart('launch', 20, 5);
