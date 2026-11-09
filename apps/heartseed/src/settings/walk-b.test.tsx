/**
 * Home's Settings sheet walked against its model (`src/test/settings-model.ts`),
 * over five more generated devices (`walk-a.test.tsx` walks the first five),
 * whose first launches meet every stored class of the minutes, the voice
 * and the appearance with other texts.
 */

import { describe } from 'bun:test';

import { settingsCase } from '../test/settings-model';

describe('the Settings sheet, walked further', () => {
  settingsCase(2, [5, 6, 7, 8, 9], 6);
});
