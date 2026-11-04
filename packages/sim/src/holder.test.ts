/**
 * The state holder (`holder.ts`) under a scheduler that wakes one command at
 * a time at every FileSystem and `Os` call (`fixtures/holders.ts`): the four
 * fixed interleavings a defect of the holder needs, and the first 50
 * generated worlds (the rest are `holder.slow.test.ts`'s). No command
 * acquires while another live one holds, a fresh command alone always
 * acquires, and the holder never signals or spawns.
 */
import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';

import { FIXED, generatedRange } from './fixtures/holders.ts';

describe('the state holder, one interleaving at a time', () => {
  for (const [name, run] of Object.entries(FIXED))
    it.live(`${name}: one holder at a time, and a fresh command acquires`, () =>
      Effect.gen(function* () {
        const world = yield* Effect.promise(run);
        expect(world.violations).toEqual([]);
      }),
    );

  it.live(
    'two reclaimers of one dead holder: the one that loses the next name lists again and holds after the other lets go',
    () =>
      Effect.gen(function* () {
        const world = yield* Effect.promise(FIXED['two reclaimers of one dead holder']);
        expect(world.outcomes).toEqual({ H: 'exited', R1: 'held', R2: 'held', fresh: 'held' });
      }),
  );

  it.live("the command on a dead holder's pid holds the state", () =>
    Effect.gen(function* () {
      const world = yield* Effect.promise(FIXED["the next command reuses a dead holder's pid"]);
      expect(world.outcomes).toEqual({ H: 'exited', N: 'held' });
    }),
  );

  it.live('generated worlds 1-50: no violation', () =>
    Effect.gen(function* () {
      const found = yield* Effect.promise(() => generatedRange(1, 51));
      expect(found.violations.slice(0, 12)).toEqual([]);
      expect(found.ends.held).toBeGreaterThan(50);
      expect(found.ends.exited).toBeGreaterThan(0);
    }),
  );
});
