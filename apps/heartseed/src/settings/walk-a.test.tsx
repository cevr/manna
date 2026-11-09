/**
 * Home's Settings sheet walked against its model (`src/test/settings-model.ts`),
 * over five generated devices whose first launches meet every stored class
 * of the minutes, the voice and the appearance; `walk-b.test.tsx` and
 * `walk-c.test.tsx` walk five more each.
 */

import { describe } from 'bun:test';

import { settingsCase } from '../test/settings-model';

describe('the Settings sheet, walked', () => {
  settingsCase(10, [0, 1, 2, 3, 4], 6);
});
