/**
 * The reader's choices across launches, read in the Settings sheet
 * (`src/test/header-walk.ts`), over devices 6 and 7: the minutes key
 * holding an empty text, none of the four, and the device with no recall,
 * whose launch opens the first minute with no choice and no sheet shown;
 * `Your field` from Today's done state reaches home with no `Begin`.
 * Devices 0 and 5 are `header-b.test.tsx`'s.
 */

import { describe } from 'bun:test';

import { headerCase } from '../test/header-walk';

describe('The reader’s choices across launches, read in Settings', () => {
  headerCase(156, [6, 7], {
    'stored:bad': 2,
    'first minute': 1,
    'sheet at launch': 1,
    'field, done': 1,
    'home:begin': 1,
  });
});
