/**
 * The reader's choices across launches, read in the Settings sheet
 * (`src/test/header-walk.ts`), over devices 3 and 4, each with a recall
 * (the passage or another verse) and the stored texts `10` and `20`:
 * unread launches offering no choice, failed reads, recitals with nothing
 * that makes the plan in reach while they listen, renewals at the due by a
 * Minutes trip, and the done state on home. Devices 1 and 2 are
 * `header.test.tsx`'s.
 */

import { describe } from 'bun:test';

import { headerCase } from '../test/header-walk';

describe('The reader’s choices across launches, read in Settings', () => {
  headerCase(738, [3, 4], {
    'stored:valid': 2,
    unread: 2,
    'minutes:none-unread': 1,
    'failed minutes read': 2,
    'failed voice read': 1,
    'listening:bare': 2,
    recital: 2,
    'new plan at the due': 2,
    'field and back': 2,
    'sheet at launch': 3,
    'home:begin': 1,
    'home:done': 1,
  });
});
