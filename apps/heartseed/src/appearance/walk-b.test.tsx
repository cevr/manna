/**
 * The reader's appearance walked through the bar rig and the Settings sheet
 * (`src/test/appearance-walk.tsx`), seeds 5-8, four commands each, whose
 * walks alone reach every floor; `walk.test.tsx` walks seeds 1-4 and
 * `walk-c.test.tsx` seeds 9-12.
 */

import { describe } from 'bun:test';

import { appearanceCase } from '../test/appearance-walk';

describe('the reader’s appearance, walked again', () => {
  appearanceCase([5, 6, 7, 8], 4);
});
