import { describe, expect, it } from 'bun:test';
import { Effect } from 'effect';

import { histories, RANGES, STEPS } from '../test/natural-voice';

const RANGE = RANGES[1];

describe('the natural voice source', () => {
  it(`equals its model over the last 150 seeded histories of ${STEPS} steps`, () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const run = yield* histories(RANGE);
        expect([run.seeds[0], run.seeds.at(-1), run.seeds.length, new Set(run.seeds).size]).toEqual(
          [52_181, 52_330, 150, 150],
        );
        for (const key of Object.keys(RANGE.floors) as ReadonlyArray<keyof typeof RANGE.floors>) {
          expect(run.totals[key], key).toBeGreaterThanOrEqual(RANGE.floors[key]);
        }
      }),
    ));
});
