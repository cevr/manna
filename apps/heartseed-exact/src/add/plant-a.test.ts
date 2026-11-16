/* oxlint-disable effect/noAsyncFunction, no-await-in-loop -- each history is awaited in turn, as Exact asks its sources one by one. */

/**
 * Planting through Add verses equals the current Heartseed's (spec A3),
 * histories 1 to 20 of 40 (`src/test/add-history.ts`).
 */

import { it } from 'bun:test';

import { runAddHistory } from '../test/add-history';

it("plants as the current app's Passages and Garden, histories 1 to 20", async () => {
  for (let seed = 1; seed <= 20; seed++) await runAddHistory(seed, 24);
});
