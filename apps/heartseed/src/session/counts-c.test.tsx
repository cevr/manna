/**
 * Today's counts line over the counts walk (`src/test/counts-walk.ts`):
 * four generated disks, leaning on Today's lines and actions, the Minutes
 * taps that change them, the recitals heard, missed and unheard, and
 * Today's done state and the new plan made after it.
 */

import { describe } from 'bun:test';

import { countsCase } from '../test/counts-walk';

describe('Today’s counts line', () => {
  countsCase(191, [2, 3, 4, 5], {
    'counts:Nothing to tend now': 3,
    'counts:n to tend · about n min': 2,
    'minutes tap': 3,
    'minutes tap refused': 1,
    'tap changed the line': 1,
    'minutes tap while listening': 1,
    'say:heard': 2,
    'say:unheard': 1,
    'say:missed': 1,
    again: 1,
    'voice tap': 1,
    'launch at morning 0': 1,
    'later:rollover': 1,
    'action:none': 5,
    'action:Next': 5,
    next: 1,
    'done state: a new plan': 3,
    'home:begin': 1,
    'home:done': 1,
  });
});
