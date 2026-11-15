/* oxlint-disable effect/noAsyncFunction, no-await-in-loop -- each history is awaited in turn, as Exact asks its sources one by one. */

/**
 * The port's garden equals the current Heartseed's (spec A2, A4), histories
 * 101 to 200 of the 300 (`src/test/garden-history.ts`).
 */

import { expect, it } from 'bun:test';

import { runHistory, STEPS } from '../test/garden-history';

it(`equals the current app's garden over histories 101 to 200 of up to ${STEPS} steps`, async () => {
  for (let seed = 101; seed <= 200; seed++) await runHistory(seed);
  expect(STEPS).toBe(30);
});
