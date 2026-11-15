/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noNullish -- Exact's app folder cannot import effect (docs/exact.md): a host script that writes the shipped passage module before Exact or a test reads it. */

/**
 * Writes Today's passage where `app.ts` imports it, `src/passage/today.ts`
 * (ignored, never committed: no verse text is kept in the repo but the KJV
 * itself; `src/passage/today.d.ts` declares it, so a fresh checkout
 * type-checks and the gate's import graph resolves it). The text is the
 * current Heartseed's own derivation for its Today verse (`readPassage`,
 * from `@manna/core`'s KJV), so the two apps show the same words.
 * `tools/prepare.ts` runs it before every `bun run exact`, and the tests and
 * drives that import `app.ts` or read the passage run it first.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { readPassage } from '@manna/heartseed/passage';

import type { Passage } from '../src/today/step';

/** The shipped passage module's path. */
export const PASSAGE_FILE = join(import.meta.dir, '..', 'src', 'passage', 'today.ts');

/** Writes the shipped passage module from the KJV, its reference and text alone, and answers them. */
export const writePassage = (): Passage => {
  const { reference, text } = readPassage();
  const passage = { reference, text };
  writeFileSync(
    PASSAGE_FILE,
    `/** Today's passage, written by tools/passage.ts from the KJV; ignored. */\nexport default ${JSON.stringify(passage, undefined, 2)};\n`,
  );
  return passage;
};
