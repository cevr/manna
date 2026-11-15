/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals -- Exact's app folder cannot import effect (docs/exact.md): a host script that writes the shipped licences module before Exact or a test reads it. */

/**
 * Writes the licences About shows where `app.ts` imports them,
 * `src/about/licences.ts` (ignored, never committed; `licences.d.ts` beside
 * it declares it). The text is the current Heartseed's own derivation,
 * `readLicence()` (`@manna/heartseed/licence`, the vendored Apache License
 * 2.0 the natural voice carries, byte for byte), so the two apps show the
 * same text. Run before every `bun run exact` and by the tests that import
 * `app.ts`.
 */

import { join } from 'node:path';

import { writeGenerated } from '@manna/exact-kit/prepare';
import { readLicence } from '@manna/heartseed/licence';

/** The shipped licences module's path. */
export const LICENCES_FILE = join(import.meta.dir, '..', 'src', 'about', 'licences.ts');

/** The licences' texts as the current app's build derives them, in the order About lists them. */
export const licenceTexts = (): string[] => [readLicence()];

/** Writes the shipped licences module, when its text changed, and answers the texts. */
export const writeLicences = (): string[] => {
  const texts = licenceTexts();
  writeGenerated(
    LICENCES_FILE,
    `/** The licences' texts, written by tools/licences.ts from the current Heartseed's; ignored. */\nexport default ${JSON.stringify(texts)};\n`,
  );
  return texts;
};

if (import.meta.main) writeLicences();
