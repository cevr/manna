/**
 * The drive's lifecycle over the model (`fixtures/life.ts`), one case per
 * trigger of the rewrite's census (`fixtures/life-cases.ts` `CENSUS`), each
 * the counterexample a failed round met: a `down` interrupted while it
 * closes the drivers; the scratch HOME made a file; the session read failing
 * while a newer boot tries the state; two downs filing into one `--out`; a
 * failed recovery after a failed or interrupted read beside a newer boot;
 * and a `down` that exits abruptly after each of its first three file
 * mutations. After each, every server is found by the next `down` and
 * stopped, and nothing is left running.
 */
import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';

import { CENSUS } from './fixtures/life-cases.ts';

describe('the census of the failed rounds, over the model', () => {
  for (const one of CENSUS)
    it.live(one.name, () =>
      Effect.gen(function* () {
        const seen = yield* Effect.promise(one.run);
        expect(seen.observed).toEqual(one.expected);
        expect(seen.violations).toEqual([]);
      }),
    );
});
