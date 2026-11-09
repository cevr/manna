/**
 * The reader's appearance walked through the bar rig and the Settings sheet
 * (`src/test/appearance-walk.tsx`), seeds 1-4, six commands each, whose
 * walks alone reach every floor; `walk-b.test.tsx` walks seeds 5-8.
 */

import { describe } from 'bun:test';

import { appearanceCase } from '../test/appearance-walk';

describe('the reader’s appearance, walked', () => {
  appearanceCase([1, 2, 3, 4]);
});
