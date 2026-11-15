/* oxlint-disable effect/noAsyncFunction, no-await-in-loop -- each history is awaited in turn, as Exact asks its sources one by one. */

/**
 * The port's session equals the current Heartseed's (spec A1, A2),
 * histories 101 to 200 of the 300 (`src/test/session-history.ts`).
 */

import { expect, it } from 'bun:test';

import { runSessionHistory, STEPS } from '../test/session-history';

it(`equals the current app's session over histories 101 to 200 of up to ${STEPS} steps`, async () => {
  for (let seed = 101; seed <= 200; seed++) await runSessionHistory(seed);
  expect(STEPS).toBe(30);
});
