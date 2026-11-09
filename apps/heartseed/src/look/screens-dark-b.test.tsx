/* oxlint-disable effect/noAsyncFunction -- a React screen test: it awaits the screen walk's promise-based run of the root. */

/**
 * The Add verses sheet and the chooser in dark, and across a flip of the
 * system on each (`src/test/screens-walk.ts`), cut from
 * `screens-dark.test.tsx` for its time budget, as `screens-b.test.tsx`
 * holds them in light: the sheet with `Psalms` open held to its own rule in
 * the scheme shown with each control pressed in turn, then the chooser
 * through `Plant`.
 */

import { describe, expect, it } from 'bun:test';

import { ADD_PLACES, walkAddScreens } from '../test/screens-walk';

describe('the Add verses sheet and the chooser, in dark', () => {
  it('holds the sheet (Psalms open) and the chooser (books, a chapter, verses chosen, Plant) to the oracle', async () => {
    const { report, reached, pressed } = await walkAddScreens('dark');
    expect({ report, reached, pressed: pressed > 10 }).toEqual({
      report: [],
      reached: ADD_PLACES,
      pressed: true,
    });
  });
});
