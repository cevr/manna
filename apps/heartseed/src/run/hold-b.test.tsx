/**
 * The hold walk's second device (`src/run/hold.test.tsx` runs the first, so
 * each part keeps under its budget): a Minutes trip through home's Settings
 * sheet with an item held, its result shown or after an unheard recital,
 * the making dropping the hold.
 */

import { walkCase } from '../test/run-walk';

walkCase('hold', 25, 1, ['made:drops-hold', 'made:drops-hold:unheard', 'settings:minutes']);
