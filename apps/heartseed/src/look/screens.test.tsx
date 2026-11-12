/* oxlint-disable effect/noAsyncFunction -- a React screen test: it awaits the screen walks' promise-based runs of the root. */

/**
 * The field, About and Today by a plant's tap in light, and across a flip of the
 * system on each (`src/test/screens-walk.ts`): every frame held to the
 * frame oracle for the system's scheme at that frame and to the rigs' own
 * rules. The field shows every plant stage (a verse not planted and the
 * legend's four) and a reader's passage opened on its own page, whose
 * remove is asked there and then pending. The Add a list sheet and the
 * chooser in light are `screens-b.test.tsx`; the same in dark is
 * `screens-dark.test.tsx`.
 */

import { describe, expect, it } from 'bun:test';

import { FIELD_PLACES, walkFieldScreens } from '../test/screens-walk';

describe('every screen but Today and the first minute, in light', () => {
  it('holds the field (every stage, a remove asked and pending) and About to the oracle', async () => {
    const { report, reached, pressed } = await walkFieldScreens('light');
    expect({ report, reached, pressed: pressed > 10 }).toEqual({
      report: [],
      reached: FIELD_PLACES,
      pressed: true,
    });
  });
});
