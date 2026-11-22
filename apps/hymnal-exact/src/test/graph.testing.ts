/* oxlint-disable effect/noNodeBuiltinImport, effect/noTryCatch -- the import-graph tests' reader of the repo's own files, by path under Bun; Bun's resolver throws on a specifier it cannot resolve. */

/**
 * The modules a bundler takes from an entry: each import it keeps (a type
 * import is dropped, as Exact's bundler drops it), resolved as Bun resolves
 * it (relative paths, a package's `exports`, `tsconfig.json` paths), followed
 * through the repo's own sources and never into `node_modules`. A specifier
 * that resolves to nothing is kept apart: the generated modules in a tree
 * where they are not written, and the book's `virtual:` modules, which
 * only the port's own `tsconfig.json` maps.
 */

import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** The repo's root, which every path the graph answers is relative to. */
export const repo = new URL('../../../../', import.meta.url).pathname;

const transpilers = new Map([
  ['ts', new Bun.Transpiler({ loader: 'ts' })],
  ['tsx', new Bun.Transpiler({ loader: 'tsx' })],
  ['js', new Bun.Transpiler({ loader: 'js' })],
  ['mjs', new Bun.Transpiler({ loader: 'js' })],
]);

/** The file `specifier` names from `from`: one, or none when it resolves to nothing. */
const resolved = (specifier: string, from: string): ReadonlyArray<string> => {
  try {
    return [Bun.resolveSync(specifier, dirname(from))];
  } catch {
    return [];
  }
};

/** The transpiler that reads `file`, if it is one of the repo's own scripts. */
const readerOf = (file: string) =>
  [...transpilers]
    .filter(([extension]) => !file.includes('/node_modules/') && file.endsWith(`.${extension}`))
    .map(([, transpiler]) => transpiler);

/** The modules reached from `entry` (a path under the repo), and the specifiers that resolved to nothing. */
export const reachedFrom = (entry: string) => {
  const seen = new Set<string>();
  const unresolved: Array<string> = [];
  const visit = (file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const reader of readerOf(file))
      for (const { path } of reader.scanImports(readFileSync(file, 'utf8'))) {
        const next = resolved(path, file);
        if (next.length === 0) unresolved.push(path);
        next.forEach(visit);
      }
  };
  visit(`${repo}${entry}`);
  return {
    reached: new Set([...seen].map((file) => file.slice(repo.length))),
    unresolved,
  };
};
