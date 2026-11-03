/* oxlint-disable effect/noNodeBuiltinImport, effect/noNullish, effect/noTernary -- a Vite and rolldown plugin, the bundler's host boundary: it runs the derivation as a child process, and its hooks answer `undefined` for a module that is not theirs, as the plugin API defines. */

/**
 * `virtual:heartseed-passage`: Today's passage, made when the app is bundled
 * by `passage.ts`. The web and the native bundle both take it from this
 * plugin (`vite.config.ts` gives it to One's native bundler too), so the
 * phone carries one verse, not the corpus. The derivation runs under Bun:
 * Vite loads this config under Node, which cannot import `@manna/core`'s
 * TypeScript.
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MODULE = 'virtual:heartseed-passage';
const SCRIPT = fileURLToPath(new URL('./passage.ts', import.meta.url));

let derived: string | undefined;

/** A Vite and rolldown plugin: `import passage from 'virtual:heartseed-passage'`. */
export const passage = () => ({
  name: 'heartseed-passage',
  resolveId: (source: string) => (source === MODULE ? `\0${MODULE}` : undefined),
  load: (module: string) => {
    if (module !== `\0${MODULE}`) return undefined;
    derived ??= execFileSync('bun', [SCRIPT], { encoding: 'utf8' });
    return `export default ${derived};`;
  },
});
