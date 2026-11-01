// The local files a module runs: its static imports and re-exports, and
// literal dynamic imports, followed to files, transitively. A relative
// specifier resolves to the file it names, or with `.ts`, `.tsx` or
// `/index.ts`; a bare one (a package) is not followed, so node_modules stays
// out. Type-only imports and re-exports run nothing and are not followed.
// Only script files are read for further imports; a JSON or other file a
// module imports is in the closure as itself.
//
// A dynamic import whose specifier is not a string literal (a variable, a
// template literal) names no file the scanner can follow. The closure records
// each one with the file it is in, so a stage that runs such a file declares
// what it loads (`declaredClosure`), and a new one cannot hide.

import { Effect, FileSystem, Option, Path, Schema } from 'effect';

const STATIC =
  /\b(?:import|export)(?!\s+type\s)\s[^'";]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

/** A dynamic import whose argument is not a single- or double-quoted string. */
const VARIABLE = /(?<![\w$.])import\(\s*(?!['"])([^)]*)\)/g;

/** The specifiers a module's text imports or re-exports, in order, type-only ones left out. */
export const specifiersOf = (text: string): ReadonlyArray<string> =>
  [...text.matchAll(STATIC)].flatMap((m) =>
    [m[1], m[2], m[3]].flatMap((s) => Option.toArray(Option.fromUndefinedOr(s))),
  );

/** The arguments of a module's dynamic imports whose specifier is not a string literal, in order. */
export const variableImportsOf = (text: string): ReadonlyArray<string> =>
  [...text.matchAll(VARIABLE)].map((m) => (m[1] ?? '').trim());

/** A dynamic import the scanner cannot follow: the file it is in, and its argument's text. */
export interface VariableImport {
  readonly file: string;
  readonly argument: string;
}

/** What a closure runs: its files, and the variable imports in them. */
export interface Closure {
  /** Absolute paths, sorted, the entries among them. */
  readonly files: ReadonlyArray<string>;
  readonly variable: ReadonlyArray<VariableImport>;
}

/** A stage's closure meets a variable import in a file the stage does not declare. */
export class UndeclaredImport extends Schema.TaggedError<UndeclaredImport>()('UndeclaredImport', {
  file: Schema.String,
  argument: Schema.String,
}) {
  override get message() {
    return `${this.file} imports \`${this.argument}\`, which no declaration beside the stage names`;
  }
}

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

/** Every local file the entries run, the entries with them, and the variable imports met on the way. */
export const importClosure = Effect.fn('cast.build.importClosure')(function* (
  entries: ReadonlyArray<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const seen = new Set<string>();
  const variable: Array<VariableImport> = [];
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
      for (const argument of variableImportsOf(text)) variable.push({ file, argument });
    }
    frontier = next;
  }
  const closure: Closure = {
    files: [...seen].toSorted(),
    variable: variable.toSorted((a, b) => a.file.localeCompare(b.file)),
  };
  return closure;
});

/**
 * The entries' closure, failing on a variable import in a file `declared` does
 * not name: the stage that runs it must say what it loads.
 */
export const declaredClosure = Effect.fn('cast.build.declaredClosure')(function* (
  entries: ReadonlyArray<string>,
  declared: ReadonlyArray<string>,
) {
  const closure = yield* importClosure(entries);
  for (const site of closure.variable)
    if (!declared.includes(site.file)) return yield* UndeclaredImport.make(site);
  return closure.files;
});
