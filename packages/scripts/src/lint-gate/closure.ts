import { Effect, FileSystem, Option, Path } from 'effect';
import * as Bool from 'effect/Boolean';

import type { LintConfig } from './config.js';

/** The JS plugins `config` loads, top level and in its overrides, each once. */
export const pluginsOf = (config: LintConfig): ReadonlyArray<string> => [
  ...new Set([...config.jsPlugins, ...config.overrides.flatMap((override) => override.jsPlugins)]),
];

/** A script Bun's transpiler reads; every other file imports nothing. */
const SCRIPT = /\.[cm]?[jt]sx?$/;

/** The loader Bun's transpiler reads `file` with. */
const loaderOf = (file: string) =>
  Bool.match(/\.[cm]?[jt]sx$/.test(file), {
    onTrue: () => 'tsx' as const,
    onFalse: () => 'ts' as const,
  });

/** `specifier` as Bun resolves it from `dir`; none when it does not resolve. */
const resolved = (specifier: string, dir: string) =>
  Effect.try(() => Bun.resolveSync(specifier, dir)).pipe(Effect.option);

/**
 * The repository files under `root` that `entries` (paths or package names,
 * resolved from `root`) run, the entries among them: relative to the root,
 * sorted.
 */
export const importClosure = Effect.fn('importClosure')(function* (
  root: string,
  entries: ReadonlyArray<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const real = yield* fs.realPath(root);
  const inRepo = (file: string) =>
    file.startsWith(`${real}${path.sep}`) && !file.split(path.sep).includes('node_modules');
  const seen = new Set<string>();
  const firsts = yield* Effect.forEach(entries, (entry) => resolved(entry, root));
  let pending = firsts.flatMap((first) => Option.toArray(first)).filter(inRepo);
  while (pending.length > 0) {
    const fresh = [...new Set(pending)].filter((file) => !seen.has(file));
    fresh.forEach((file) => seen.add(file));
    const next = yield* Effect.forEach(
      fresh.filter((file) => SCRIPT.test(file)),
      (file) =>
        Effect.gen(function* () {
          const source = yield* fs.readFileString(file);
          const imports = new Bun.Transpiler({ loader: loaderOf(file) }).scanImports(source);
          const targets = yield* Effect.forEach(imports, (found) =>
            resolved(found.path, path.dirname(file)),
          );
          return targets.flatMap((target) => Option.toArray(target)).filter(inRepo);
        }),
      { concurrency: 16 },
    );
    pending = next.flat();
  }
  return [...seen].map((file) => path.relative(real, file)).toSorted();
});
