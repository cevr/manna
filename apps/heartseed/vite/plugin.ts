/* oxlint-disable effect/noNodeBuiltinImport, effect/noNullish, effect/noTernary -- a Vite and rolldown plugin, the bundler's host boundary: it runs the derivations as child processes, and its hooks answer `undefined` for a module that is not theirs, as the plugin API defines. */

/**
 * The app's four bundle-time modules, each made by its script when the app
 * is bundled:
 * - `virtual:heartseed-passage`, Today's passage (`passage.ts`), so the
 *   promise needs no corpus read;
 * - `virtual:heartseed-kjv`, the whole KJV as one string per chapter
 *   (`kjv.ts`), which the app reads through `src/kjv.ts` alone;
 * - `virtual:heartseed-lexicon`, the natural voice's two pronunciation
 *   lists (Her's American, Him's British) and Kokoro's vocab (`lexicon.ts`),
 *   read through `src/natural/lexicon.ts` alone;
 * - `virtual:heartseed-licence`, the Apache License 2.0 the natural voice's
 *   vendored code carries (`licence.ts`), shown whole by the About screen
 *   (`src/about/screen.tsx`) alone.
 *
 * The web and the native bundle both take them from this plugin
 * (`vite.config.ts` gives it to One's native bundler too), so the phone
 * carries the derived corpus, never the 7.8 MB source file. Each
 * derivation runs under Bun, once a process: Vite loads this config under
 * Node, which cannot import `@manna/core`'s TypeScript.
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Each module this plugin serves, and the script that derives it. */
const SCRIPTS: ReadonlyMap<string, string> = new Map([
  ['virtual:heartseed-passage', fileURLToPath(new URL('./passage.ts', import.meta.url))],
  ['virtual:heartseed-kjv', fileURLToPath(new URL('./kjv.ts', import.meta.url))],
  ['virtual:heartseed-lexicon', fileURLToPath(new URL('./lexicon.ts', import.meta.url))],
  ['virtual:heartseed-licence', fileURLToPath(new URL('./licence.ts', import.meta.url))],
]);

/** The derived corpus is about 4.2 MB of JSON, past the child process's default 1 MB. */
const MOST_OUTPUT = 16 * 1024 * 1024;

const derived = new Map<string, string>();

/** The module's derivation, run once a process. */
const derive = (module: string, script: string): string => {
  const known = derived.get(module);
  if (known !== undefined) return known;
  const json = execFileSync('bun', [script], { encoding: 'utf8', maxBuffer: MOST_OUTPUT });
  derived.set(module, json);
  return json;
};

/** A Vite and rolldown plugin: `import passage from 'virtual:heartseed-passage'`, `import chapters from 'virtual:heartseed-kjv'`, `import lexicon from 'virtual:heartseed-lexicon'` and `import licence from 'virtual:heartseed-licence'`. */
export const passage = () => ({
  name: 'heartseed-passage',
  resolveId: (source: string) => (SCRIPTS.has(source) ? `\0${source}` : undefined),
  load: (id: string) => {
    const module = id.slice(1);
    const script = id.startsWith('\0') ? SCRIPTS.get(module) : undefined;
    if (script === undefined) return undefined;
    return `export default ${derive(module, script)};`;
  },
});
