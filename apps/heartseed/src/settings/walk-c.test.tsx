/**
 * Home's Settings sheet walked against its model (`src/test/settings-model.ts`),
 * over five more generated devices, which start from `walk-a.test.tsx`'s
 * stored texts with other passages and other commands.
 */

import { describe } from 'bun:test';

import { settingsCase } from '../test/settings-model';

describe('the Settings sheet, walked again', () => {
  settingsCase(11, [10, 11, 12, 13, 14], 6);
});
