/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals -- Exact's app folder cannot import effect (docs/exact.md): a host script that writes the shipped licences module before Exact or a test reads it. */

/**
 * Writes the licences About shows where `app.ts` imports them,
 * `src/about/licences.ts` (ignored, never committed; `licences.d.ts` beside
 * it declares it). The text is the current Heartseed's own derivation,
 * `readLicence()` (`@manna/heartseed/licence`, the vendored Apache License
 * 2.0 the natural voice carries, byte for byte), so the two apps show the
 * same text; then each bundled reading font's SIL Open Font License, its
 * family's `OFL.txt` whole under the family's name. Run before every `bun
 * run exact` and by the tests that import `app.ts`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { writeGenerated } from '@manna/exact-kit/prepare';
import { readLicence } from '@manna/heartseed/licence';

import { TYPE_FONTS } from '../src/type/choices';
import { FONTS_DIR } from './fonts';

/** The shipped licences module's path. */
export const LICENCES_FILE = join(import.meta.dir, '..', 'src', 'about', 'licences.ts');

/** A bundled reading font's licence as About shows it: the family and the licence's name over its `OFL.txt`, whole. */
export const fontLicence = (family: string, ofl: string): string =>
  `${family}\nSIL Open Font License, Version 1.1\n\n${ofl}`;

/** The licences' texts in the order About lists them: the current app's own, then each bundled reading font's (`assets/fonts/<key>/OFL.txt`) in the sheet's order. */
export const licenceTexts = (): string[] => [
  readLicence(),
  ...TYPE_FONTS.filter((font) => font.bundled !== '').map((font) =>
    fontLicence(font.bundled, readFileSync(join(FONTS_DIR, font.key, 'OFL.txt'), 'utf8')),
  ),
];

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
