/**
 * The reader's appearance walked through the bar rig and the Settings sheet
 * (`src/test/appearance-walk.tsx`), seeds 9-12, four commands each, whose
 * walks alone reach every floor; `walk.test.tsx` walks seeds 1-4 and
 * `walk-b.test.tsx` seeds 5-8.
 */

import { describe } from 'bun:test';

import { appearanceCase } from '../test/appearance-walk';

describe('the reader’s appearance, walked a third time', () => {
  appearanceCase([9, 10, 11, 12], 4);
});
