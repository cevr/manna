/**
 * The state holder's generated worlds past the unit test's first 50
 * (`fixtures/holders.ts`): seeds 51 to 4050, in parts of 250. Each world is
 * 3-5 commands at once with typed failures and abrupt exits, then 1-3 more
 * (some on a dead command's pid), then a fresh command alone.
 */
import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';

import { generatedRange } from './fixtures/holders.ts';

const FIRST = 51;
const PART = 250;
const PARTS = 16;

describe('the state holder over generated interleavings', () => {
  for (let part = 0; part < PARTS; part += 1) {
    const from = FIRST + part * PART;
    it.live(`generated worlds ${from}-${from + PART - 1}: no violation`, () =>
      Effect.gen(function* () {
        const found = yield* Effect.promise(() => generatedRange(from, from + PART));
        expect(found.violations.slice(0, 12)).toEqual([]);
        expect(found.ends.exited).toBeGreaterThan(0);
        expect(found.ends.busy).toBeGreaterThan(0);
      }),
    );
  }
});
