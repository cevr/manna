/**
 * Today's header's walk (`src/test/header-walk.ts`) over devices 0 and 5-7:
 * the minutes key absent and holding texts none of the four, and the
 * device with no recall, whose launch opens the first minute. Devices 1-4
 * are `header.test.tsx`'s.
 */

import { describe } from 'bun:test';

import { headerCase } from '../test/header-walk';

describe('Today’s header holds the minutes and the voice', () => {
  headerCase(3, [0, 5, 6, 7], {
    'stored:absent': 1,
    'stored:bad': 3,
    'first minute': 1,
    'field, done': 1,
    'home:begin': 1,
  });
});
