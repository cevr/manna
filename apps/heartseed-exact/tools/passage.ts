/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noNullish -- Exact's app folder cannot import effect (docs/exact.md): a host script that writes the shipped passage file as JSON before Exact or a test reads it. */

/**
 * Writes Today's passage where `app.ts` imports it,
 * `src/passage/today.json` (ignored, never committed: no verse text is kept
 * in the repo but the KJV itself). The text is the current Heartseed's own
 * derivation for its Today verse (`readPassage`, from `@manna/core`'s KJV),
 * so the two apps show the same words. `tools/prepare.ts` runs it before
 * every `bun run exact`, and the tests that import `app.ts` run it first.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { readPassage } from '@manna/heartseed/passage';

import type { Passage } from '../src/today/step';

/** The shipped passage file's path. */
export const PASSAGE_FILE = join(import.meta.dir, '..', 'src', 'passage', 'today.json');

/** The shipped file's text for `passage`: its reference and text alone, as JSON. */
export const passageJson = (passage: Passage): string =>
  `${JSON.stringify({ reference: passage.reference, text: passage.text }, undefined, 2)}\n`;

/** Writes the shipped passage file from the KJV and answers its text. */
export const writePassage = (): string => {
  const text = passageJson(readPassage());
  writeFileSync(PASSAGE_FILE, text);
  return text;
};
