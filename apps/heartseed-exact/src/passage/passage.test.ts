/* oxlint-disable effect/noAsyncFunction -- Exact's app folder cannot import effect (docs/exact.md): the test imports the written module with a dynamic import. */

/**
 * The passage the app ships is the current Heartseed's own: the module
 * `tools/passage.ts` writes, which `app.ts` imports, holds what
 * `apps/heartseed/vite/passage.ts` derives for Isaiah 41:10 from the KJV in
 * `@manna/core`, and nothing else.
 */

import { expect, it } from 'bun:test';
import { passageOf } from '@manna/heartseed/passage';

import { PASSAGE_FILE, writePassage } from '../../tools/passage';

it("ships Heartseed's derivation of Isaiah 41:10", async () => {
  const written = writePassage();
  expect(written).toEqual(passageOf('Isaiah 41:10'));
  const shipped: { readonly default: unknown } = await import(PASSAGE_FILE);
  expect(shipped.default).toEqual(written);
});
