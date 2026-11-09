/**
 * Today's counts line over the counts walk (`src/test/counts-walk.ts`):
 * the two fresh installs planted through the first minute (devices 0 and
 * 1), launched in zones that change, an unread launch offering no choices,
 * and a Minutes choice made in the Settings sheet. Their generated
 * neighbours (devices 2 and 3) are `counts-d.test.tsx`'s; the other
 * generated devices are `counts-b.test.tsx`'s and `counts-c.test.tsx`'s.
 */

import { describe } from 'bun:test';

import { countsCase } from '../test/counts-walk';

describe('Today’s counts line', () => {
  countsCase(65, [0, 1], {
    'fresh:evening': 1,
    'fresh:day': 1,
    'first minute': 2,
    unread: 1,
    'counts:none': 1,
    'say:unheard:unread': 1,
    'later:morning': 1,
    'later:back': 1,
    'wait:to due': 1,
    'zone changed': 1,
    'home:begin': 1,
    'home:done': 1,
    'settings:minutes': 1,
    'minutes:none-unread': 1,
  });
});
