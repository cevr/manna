/* oxlint-disable effect/noNodeBuiltinImport, effect/noAsyncFunction, effect/noGlobals -- a Bun test reading one tracked contract file beside it, as the gate's other source checks do. */

/**
 * A Contract task's interval is a whole-number literal, so the peek's
 * moment is written twice: `TODAY_PEEK_MS` in the step and `after(…)` in
 * `features/today.contract`. This test holds them to one value.
 */

import { expect, it } from 'bun:test';
import { join } from 'node:path';

import { TODAY_PEEK_MS } from './step';

const CONTRACT = join(import.meta.dir, '../../features/today.contract');

it("the contract's peek timer waits TODAY_PEEK_MS", async () => {
  const contract = await Bun.file(CONTRACT).text();
  const waits = [...contract.matchAll(/after\((\d+), todayPeekOver\)/gu)].map((found) =>
    Number(found[1]),
  );
  expect(waits).toEqual([TODAY_PEEK_MS]);
});
