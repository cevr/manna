/* oxlint-disable effect/noAsyncFunction, effect/noGlobals -- Exact's app folder cannot import effect (docs/exact.md): the test reads the shipped file with Bun and its JSON with JSON.parse. */

/**
 * The passage the app ships is the current Heartseed's own: the file
 * `tools/passage.ts` writes, which `app.ts` imports, holds what
 * `apps/heartseed/vite/passage.ts` derives for Isaiah 41:10 from the KJV in
 * `@manna/core`, and nothing else.
 */

import { expect, it } from 'bun:test';
import { passageOf } from '@manna/heartseed/passage';

import { PASSAGE_FILE, writePassage } from '../../tools/passage';

it("ships Heartseed's derivation of Isaiah 41:10", async () => {
  const written = writePassage();
  expect(JSON.parse(written)).toEqual(passageOf('Isaiah 41:10'));
  expect(await Bun.file(PASSAGE_FILE).text()).toBe(written);
});
