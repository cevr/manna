/* oxlint-disable effect/noAsyncFunction, no-await-in-loop -- each history is awaited in turn, as Exact asks its sources one by one. */

/**
 * Planting through Add verses equals the current Heartseed's (spec A3),
 * histories 21 to 40 of 40 (`src/test/add-history.ts`).
 */

import { it } from 'bun:test';

import { runAddHistory } from '../test/add-history';

it("plants as the current app's Passages and Garden, histories 21 to 40", async () => {
  for (let seed = 21; seed <= 40; seed++) await runAddHistory(seed, 24);
});
