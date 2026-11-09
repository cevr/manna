/* oxlint-disable effect/noAsyncFunction -- a React screen test: it awaits the screen walks' promise-based runs of the root. */

/**
 * The field, About and When I need… in dark, and across a flip of the
 * system on each (`src/test/screens-walk.ts`), as `screens.test.tsx` holds
 * them in light: every frame held to the frame oracle for the system's
 * scheme at that frame and to the rigs' own rules, the field at every plant
 * stage with a remove asked and pending, and When I need…'s cards. The
 * Add verses sheet and the chooser in dark are `screens-dark-b.test.tsx`.
 */

import { describe, expect, it } from 'bun:test';

import { FIELD_PLACES, walkFieldScreens, walkNeedScreen } from '../test/screens-walk';

describe('every screen but Today and the first minute, in dark', () => {
  it('holds the field (every stage, a remove asked and pending) and About to the oracle', async () => {
    const { report, reached, pressed } = await walkFieldScreens('dark');
    expect({ report, reached, pressed: pressed > 10 }).toEqual({
      report: [],
      reached: FIELD_PLACES,
      pressed: true,
    });
  });

  it('holds When I need… and its cards to the oracle', async () => {
    const { report, cards } = await walkNeedScreen('dark');
    expect({ report, cards: cards > 0 }).toEqual({ report: [], cards: true });
  });
});
