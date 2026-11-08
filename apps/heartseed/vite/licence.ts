/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals -- a build-time host script, as lexicon.ts: the bundler plugin runs it under Bun and reads its standard output, and the test preload calls it synchronously, so it reads the vendored licence from disk. */

/**
 * The Apache License 2.0 the natural voice's vendored code and data carry
 * (`native/natural/kokoro/LICENSE`), as the About screen shows it: the
 * file's text byte for byte, never trimmed or reflowed. Read by the
 * `virtual:heartseed-licence` plugin (`plugin.ts`) and by the app's tests;
 * the app reads it through `src/about/screen.tsx` alone.
 */

import { readFileSync } from 'node:fs';

/** The licence file's text. */
export const readLicence = (): string =>
  readFileSync(new URL('../native/natural/kokoro/LICENSE', import.meta.url), 'utf8');

if (import.meta.main) process.stdout.write(JSON.stringify(readLicence()));
