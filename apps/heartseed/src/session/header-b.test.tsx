/**
 * The reader's choices across launches, read in the Settings sheet
 * (`src/test/header-walk.ts`), over devices 0 and 5: the minutes key absent
 * and holding `7`, a text none of the four, each launch's sheet showing the
 * minutes 5 and the voice read. Devices 6 and 7 are `header-d.test.tsx`'s;
 * devices 1-4 are `header.test.tsx`'s and `header-c.test.tsx`'s.
 */

import { describe } from 'bun:test';

import { headerCase } from '../test/header-walk';

describe('The reader’s choices across launches, read in Settings', () => {
  headerCase(105, [0, 5], {
    'stored:absent': 1,
    'stored:bad': 1,
    'sheet at launch': 1,
    'home:begin': 1,
  });
});
