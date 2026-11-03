/**
 * The contained host's resolver and tree walk against the OS
 * (`fixtures/differential.ts`) over many generated worlds: every path
 * decision and every resolved path is the OS's, and every tool tree is
 * refused exactly when a link reachable in it leads out of the app.
 */
import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';

import { differential } from './fixtures/differential.ts';

describe('the contained host against the OS', () => {
  for (let first = 0; first < 400; first += 20)
    it.live(`agrees with the OS on worlds ${first} to ${first + 19}`, () =>
      Effect.gen(function* () {
        const found = yield* Effect.promise(() => differential(first, 20));
        expect(found.slice(0, 8)).toEqual([]);
      }),
    );
});
