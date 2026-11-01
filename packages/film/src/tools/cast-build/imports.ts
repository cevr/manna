// The local files a module runs: its static imports and re-exports, and
// literal dynamic imports, followed to files, transitively. A relative
// specifier resolves to the file it names, or with `.ts`, `.tsx` or
// `/index.ts`; a bare one (a package) is not followed, so node_modules stays
// out. Type-only imports and re-exports run nothing and are not followed.
// Only script files are read for further imports; a JSON or other file a
// module imports is in the closure as itself.

import { Effect, FileSystem, Option, Path } from 'effect';

const STATIC =
  /\b(?:import|export)(?!\s+type\s)\s[^'";]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

/** The specifiers a module's text imports or re-exports, in order, type-only ones left out. */
export const specifiersOf = (text: string): ReadonlyArray<string> =>
  [...text.matchAll(STATIC)].flatMap((m) =>
    [m[1], m[2], m[3]].flatMap((s) => Option.toArray(Option.fromUndefinedOr(s))),
  );

const SCRIPT = /\.(?:ts|tsx|js|mjs)$/;

/** The file a specifier names from `file`'s folder, if it is relative and resolves. */
const resolve = (file: string, specifier: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    if (!specifier.startsWith('.')) return Option.none<string>();
    const base = path.resolve(path.dirname(file), specifier);
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
      const info = yield* fs.stat(candidate).pipe(Effect.option);
      if (Option.exists(info, (i) => i.type === 'File')) return Option.some(candidate);
    }
    return Option.none<string>();
  });

/** Every local file the entries run, the entries with them, as absolute paths, sorted. */
export const importClosure = Effect.fn('cast.build.importClosure')(function* (
  entries: ReadonlyArray<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const seen = new Set<string>();
  let frontier: ReadonlyArray<string> = entries;
  while (frontier.length > 0) {
    const next: Array<string> = [];
    for (const file of frontier) {
      if (seen.has(file)) continue;
      seen.add(file);
      if (!SCRIPT.test(file)) continue;
      const text = yield* fs.readFileString(file);
      for (const specifier of specifiersOf(text))
        next.push(...Option.toArray(yield* resolve(file, specifier)));
    }
    frontier = next;
  }
  return [...seen].toSorted();
});
