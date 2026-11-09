/**
 * Today's run against its model on generated devices, leaning toward the
 * hold's moments (`src/test/run-walk.ts`): a Minutes trip through home's
 * Settings sheet with an item held, its result shown or after an unheard
 * recital, the making dropping the hold (a short plan over long pieces,
 * crowded devices among them). The making while a recital listens or
 * finishes, whose new plan holds the item first, later or not at all, is
 * `src/session/cells.property.test.ts`'s; the field and back and a
 * relaunch with a hold are `src/run/relaunch.test.tsx`'s. This part runs
 * the walk's first device, `src/run/hold-b.test.tsx` its second.
 */

import { walkCase } from '../test/run-walk';

walkCase('hold', 8, 1, ['made:drops-hold', 'made:drops-hold:unheard', 'settings:minutes']);
