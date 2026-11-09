/**
 * Today's counts line over the counts walk (`src/test/counts-walk.ts`):
 * two generated disks (devices 2 and 3), leaning on Today's lines and
 * actions, the Minutes and Voice choices made in the Settings sheet, the
 * recitals heard and unheard, Again, and Today's done state and the new
 * plan made after it. Devices 4 and 5, with a Minutes choice after a
 * recital, a missed recital and the trips that end on home's done state,
 * are `counts-f.test.tsx`'s.
 */

import { describe } from 'bun:test';

import { countsCase } from '../test/counts-walk';

describe('Today’s counts line', () => {
  countsCase(128, [2, 3], {
    'counts:Nothing to tend now': 3,
    'counts:n to tend · about n min': 2,
    'minutes tap': 3,
    'minutes tap refused': 1,
    'tap changed the line': 1,
    'say:heard': 2,
    'say:unheard': 1,
    again: 1,
    'voice tap': 1,
    'later:rollover': 1,
    'action:none': 2,
    'action:Next': 5,
    next: 1,
    'done state: a new plan': 2,
    'home:begin': 1,
    'settings:minutes': 1,
    'settings:voice': 1,
  });
});
