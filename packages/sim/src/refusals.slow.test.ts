/**
 * Every command with each of its host calls refused in turn, as the
 * contained host refuses one (`fixtures/contain.ts`, `refusals`): a run
 * that fails fails typed and prints its error once as the CLI's failure
 * line, whether the refused call was a step's, a receipt's, the journey's
 * results file or the server's output. A journey makes the most calls (each
 * driver it runs has its HOME read whole first), so it runs in parts.
 */
import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';

import { commandNames, refusals } from './fixtures/contain.ts';

/** The parts a command's refused calls are cut into, by its name; one when it is not named. */
const PARTS = new Map([
  ['ios:journey probe --skip-video', 3],
  ['ios:journey probe', 3],
]);

describe('a refused host call is printed once', () => {
  for (const name of commandNames) {
    const parts = PARTS.get(name) ?? 1;
    for (let part = 0; part < parts; part += 1) {
      let title = `${name}: each refused call fails typed and prints its failure line once`;
      if (parts > 1) title = `${title}, part ${part + 1} of ${parts}`;
      it.live(title, () =>
        Effect.gen(function* () {
          const problems = yield* Effect.promise(() => refusals(name, part, parts));
          expect(problems.slice(0, 8)).toEqual([]);
        }),
      );
    }
  }
});
