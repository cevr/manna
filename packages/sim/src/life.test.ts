/**
 * The drive's lifecycle over the model (`fixtures/life.ts`), three fixed
 * cases (`fixtures/life-cases.ts` `UNIT`): a `down` that exits abruptly
 * after its first file mutation (a census trigger: no finalizer runs) is
 * followed by a `down` that finds the server and stops it, and a `boot`
 * that starts afresh; a dead holder is reclaimed by the next `down`; and of
 * two `down`s that reclaim one dead holder at once, exactly one stops the
 * server.
 */
import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';

import { UNIT } from './fixtures/life-cases.ts';

describe('the drive over a model process table, one command at a time', () => {
  for (const one of UNIT)
    it.live(one.name, () =>
      Effect.gen(function* () {
        const seen = yield* Effect.promise(one.run);
        expect(seen.observed).toEqual(one.expected);
        expect(seen.violations).toEqual([]);
      }),
    );
});
