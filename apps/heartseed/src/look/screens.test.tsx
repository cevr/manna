/* oxlint-disable effect/noAsyncFunction -- a React screen test: it awaits the screen walks' promise-based runs of the root. */

/**
 * The field, About, the chooser and When I need… in light, and across a
 * flip of the system on each (`src/test/screens-walk.ts`): every frame held to the
 * frame oracle for the system's scheme at that frame and to the rigs' own
 * rules. The field shows every plant stage (a verse not planted and the
 * legend's four) and a reader's passage whose remove is asked and then
 * pending; the chooser shows the books, a chapter, verses chosen and
 * `Plant`; When I need… shows its cards. The same in dark is
 * `screens-dark.test.tsx`.
 */

import { describe, expect, it } from 'bun:test';

import { FIELD_PLACES, walkFieldScreens, walkNeedScreen } from '../test/screens-walk';

describe('every screen but Today and the first minute, in light', () => {
  it('holds the field (every stage, a remove asked and pending), About and the chooser (books, a chapter, verses chosen, Plant) to the oracle', async () => {
    const { report, reached, pressed } = await walkFieldScreens('light');
    expect({ report, reached, pressed: pressed > 10 }).toEqual({
      report: [],
      reached: FIELD_PLACES,
      pressed: true,
    });
  });

  it('holds When I need… and its cards to the oracle', async () => {
    const { report, cards } = await walkNeedScreen('light');
    expect({ report, cards: cards > 0 }).toEqual({ report: [], cards: true });
  });
});
