/**
 * Every command with each of its host calls refused in turn, as the
 * contained host refuses one (`fixtures/contain.ts`, `refusals`): a run
 * that fails fails typed and prints its error once as the CLI's failure
 * line, whether the refused call was a step's, a receipt's, the journey's
 * results file or the server's output.
 */
import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';

import { commandNames, refusals } from './fixtures/contain.ts';

describe('a refused host call is printed once', () => {
  for (const name of commandNames)
    it.live(`${name}: each refused call fails typed and prints its failure line once`, () =>
      Effect.gen(function* () {
        const problems = yield* Effect.promise(() => refusals(name));
        expect(problems.slice(0, 8)).toEqual([]);
      }),
    );
});
