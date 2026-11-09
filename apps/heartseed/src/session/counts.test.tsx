/**
 * Today's counts line over the counts walk (`src/test/counts-walk.ts`):
 * the two fresh installs planted through the first minute (devices 0 and
 * 1) beside two generated disks, launched in zones that change. The other
 * generated devices are `counts-b.test.tsx`'s and `counts-c.test.tsx`'s.
 */

import { describe } from 'bun:test';

import { countsCase } from '../test/counts-walk';

describe('Today’s counts line', () => {
  countsCase(384, [0, 1, 2, 3], {
    'fresh:evening': 1,
    'fresh:day': 1,
    'first minute': 2,
    unread: 1,
    'counts:none': 1,
    'say:unheard:unread': 1,
    'history:evening': 2,
    'launch at morning -1': 1,
    'later:morning': 1,
    'later:month': 1,
    'later:back': 1,
    'wait:to due': 1,
    'zone changed': 1,
    'home:begin': 1,
    'home:done': 1,
  });
});
