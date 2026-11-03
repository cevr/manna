/* oxlint-disable effect/noNodeBuiltinImport, effect/noNullish, effect/noTernary -- a Vite and rolldown plugin, the bundler's host boundary: it runs the derivations as child processes, and its hooks answer `undefined` for a module that is not theirs, as the plugin API defines. */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const modules = new Map([
  ['virtual:hymnal', fileURLToPath(new URL('./words.ts', import.meta.url))],
  ['virtual:hymnal-chords', fileURLToPath(new URL('./chords.ts', import.meta.url))],
  ['virtual:hymnal-timing', fileURLToPath(new URL('./timing.ts', import.meta.url))],
  ['virtual:hymnal-indexes', fileURLToPath(new URL('./indexes.ts', import.meta.url))],
]);

const derived = new Map<string, string>();

export const hymnal = () => ({
  name: 'hymnal',
  resolveId: (source: string) => (modules.has(source) ? `\0${source}` : undefined),
  load: (module: string) => {
    const id = module.slice(1);
    const script = module.startsWith('\0') ? modules.get(id) : undefined;
    if (script === undefined) return undefined;
    const json =
      derived.get(id) ??
      execFileSync('bun', [script], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    derived.set(id, json);
    return `export default ${json};`;
  },
});
