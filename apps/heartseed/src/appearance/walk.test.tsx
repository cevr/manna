/**
 * The reader's appearance walked through the bar rig and the Settings sheet
 * (`src/test/appearance-walk.tsx`), seeds 1-4, four commands each, whose
 * walks alone reach every floor; `walk-b.test.tsx` walks seeds 5-8 and
 * `walk-c.test.tsx` seeds 9-12.
 */

import { describe } from 'bun:test';

import { appearanceCase } from '../test/appearance-walk';

describe('the reader’s appearance, walked', () => {
  appearanceCase([1, 2, 3, 4], 4);
});
