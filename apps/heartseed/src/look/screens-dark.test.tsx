/* oxlint-disable effect/noAsyncFunction -- a React screen test: it awaits the screen walks' promise-based runs of the root. */

/**
 * The field, About and the chosen card in dark, and across a flip of the
 * system on each (`src/test/screens-walk.ts`), as `screens.test.tsx` holds
 * them in light: every frame held to the frame oracle for the system's
 * scheme at that frame and to the rigs' own rules, the field at every plant
 * stage and a passage's own page with a remove asked and pending. The
 * Add a list sheet and the chooser in dark are `screens-dark-b.test.tsx`.
 */

import { describe, expect, it } from 'bun:test';

import { FIELD_PLACES, walkFieldScreens } from '../test/screens-walk';

describe('every screen but Today and the first minute, in dark', () => {
  it('holds the field (every stage, a remove asked and pending) and About to the oracle', async () => {
    const { report, reached, pressed } = await walkFieldScreens('dark');
    expect({ report, reached, pressed: pressed > 10 }).toEqual({
      report: [],
      reached: FIELD_PLACES,
      pressed: true,
    });
  });
});
