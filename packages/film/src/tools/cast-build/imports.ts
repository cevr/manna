// The local files a module runs: its static imports and re-exports, and
// literal dynamic imports, followed to files, transitively. A relative
// specifier resolves as Bun resolves it: the file it names, its `.ts` file for
// a `.js` name, or with `.ts`, `.tsx`, `.js` or an `index` file; one that names
// no file fails the closure. A workspace package (`@manna/*`) is followed to the
// source file its `package.json` exports; another package is not followed, so
// node_modules stays out. Type-only imports and re-exports run nothing and are not followed.
// Only script files are read for further imports; a JSON or other file a
// module imports is in the closure as itself.
//
// Each module is parsed (oxc-parser, as the scene files are), so comments and
// strings that show an import are no import. A dynamic import is static only
// when its argument is one plain string literal; every other argument (a
// variable, a concatenation, a cast, a template literal) names no file the
// scanner can follow. The closure records each one with the file it is in,
// so a stage that runs such a file declares what it loads
// (`declaredClosure`), and a new one cannot hide.

import { Effect, FileSystem, Option, Path, Predicate, Schema } from 'effect';
import { Visitor, parseSync } from 'oxc-parser';
import { pageSpecifiers } from './page-html.ts';

/** A module that does not parse, so its imports cannot be read. */
export class ImportsUnparsed extends Schema.TaggedError<ImportsUnparsed>()('ImportsUnparsed', {
  file: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.file} does not parse: ${this.reason}`;
  }
}

/** The language oxc-parser reads a script file as, by its extension. */
const langOf = (file: string) => {
  if (file.endsWith('.tsx')) return 'tsx';
  if (file.endsWith('.jsx')) return 'jsx';
  if (/\.[cm]?ts$/.test(file)) return 'ts';
  return 'js';
};

/**
 * What a module's text imports: the specifiers its value imports, re-exports
 * and literal dynamic imports name, in order (type-only ones left out), and
 * the argument text of each dynamic import that is not one string literal.
 */
const importsOf = (file: string, text: string) => {
  const parsed = parseSync(file, text, { lang: langOf(file), sourceType: 'module' });
  const specifiers: Array<string> = [];
  const variable: Array<string> = [];
  new Visitor({
    ImportDeclaration: (node) => {
      if (node.importKind !== 'type') specifiers.push(node.source.value);
    },
    ExportNamedDeclaration: (node) => {
      if (node.exportKind === 'type') return;
      specifiers.push(
        ...Option.toArray(Option.map(Option.fromNullOr(node.source), (s) => s.value)),
      );
    },
    ExportAllDeclaration: (node) => {
      if (node.exportKind !== 'type') specifiers.push(node.source.value);
    },
    ImportExpression: (node) => {
      const { source } = node;
      if (source.type === 'Literal' && Predicate.isString(source.value))
        specifiers.push(source.value);
      else variable.push(text.slice(source.start, source.end));
    },
  }).visit(parsed.program);
  return Option.match(Option.fromUndefinedOr(parsed.errors[0]), {
    onNone: () => Effect.succeed({ specifiers, variable }),
    onSome: (error) => Effect.fail(ImportsUnparsed.make({ file, reason: error.message })),
  });
};

/** A dynamic import the scanner cannot follow: the file it is in, and its argument's text. */
interface VariableImport {
  readonly file: string;
  readonly argument: string;
}

/** What a closure runs: its files, and the variable imports in them. */
interface Closure {
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

/** A relative specifier names no file, so the closure cannot be whole. */
export class ImportUnresolved extends Schema.TaggedError<ImportUnresolved>()('ImportUnresolved', {
  file: Schema.String,
  specifier: Schema.String,
}) {
  override get message() {
    return `${this.file} imports '${this.specifier}', which names no file`;
  }
}

const SCRIPT = /\.(?:[cm]?[jt]sx?)$/;

/** The TypeScript names Bun tries for a script name, after the name itself: `./b.js` is `./b.ts`. */
const TS_NAMES = {
  '.js': ['.ts', '.tsx'],
  '.jsx': ['.tsx', '.ts'],
  '.mjs': ['.mts'],
  '.cjs': ['.cts'],
} as const satisfies Readonly<Record<string, ReadonlyArray<string>>>;

const tsNamesOf = (ext: string): ReadonlyArray<string> =>
  Object.entries(TS_NAMES).find(([js]) => js === ext)?.[1] ?? [];

/** The files a relative specifier may name, in the order Bun tries them. */
const candidatesOf = (path: Path.Path, base: string) => {
  const ext = path.extname(base);
  const stem = base.slice(0, base.length - ext.length);
  return [
    base,
    ...tsNamesOf(ext).map((ts) => `${stem}${ts}`),
    ...['.ts', '.tsx', '.js'].map((e) => `${base}${e}`),
    ...['index.ts', 'index.tsx', 'index.js'].map((i) => path.join(base, i)),
  ];
};

/** A workspace package's specifier: `@manna/<name>`, then its export's subpath. */
const WORKSPACE = /^(@manna\/[^/]+)(\/.*)?$/;

const PackageExports = Schema.Struct({
  exports: Schema.Record(Schema.String, Schema.String),
});
const decodeExports = Schema.decodeUnknownEffect(Schema.fromJsonString(PackageExports));

/**
 * The source file a workspace specifier names, as Bun resolves it: the
 * package's link in the nearest `node_modules` above `file`, followed to its
 * folder, and the file its `package.json` exports at the subpath.
 */
const resolveWorkspace = (file: string, specifier: string, name: string, subpath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const unresolved = ImportUnresolved.make({ file, specifier });
    let dir = path.dirname(file);
    for (;;) {
      const link = path.join(dir, 'node_modules', name);
      if (yield* fs.exists(link)) {
        const folder = yield* fs.realPath(link);
        const manifest = yield* fs.readFileString(path.join(folder, 'package.json'));
        const { exports } = yield* decodeExports(manifest).pipe(Effect.mapError(() => unresolved));
        const target = Option.fromNullishOr(
          Object.entries(exports).find(([key]) => key === subpath),
        );
        if (Option.isNone(target)) return yield* unresolved;
        return Option.some(path.join(folder, target.value[1]));
      }
      const up = path.dirname(dir);
      if (up === dir) return yield* unresolved;
      dir = up;
    }
  });

/**
 * The file a specifier names from `file`'s folder: the file for a relative
 * one or a workspace package's (`@manna/*`), none for another package, and
 * `ImportUnresolved` for one of ours that names no file.
 */
const resolve = (file: string, specifier: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    if (!specifier.startsWith('.')) {
      const workspace = Option.fromNullishOr(WORKSPACE.exec(specifier));
      if (Option.isNone(workspace)) return Option.none<string>();
      const [, name = '', rest = ''] = workspace.value;
      return yield* resolveWorkspace(file, specifier, name, `.${rest}`);
    }
    for (const candidate of candidatesOf(path, path.resolve(path.dirname(file), specifier))) {
      const info = yield* fs.stat(candidate).pipe(Effect.option);
      if (Option.exists(info, (i) => i.type === 'File')) return Option.some(candidate);
    }
    return yield* ImportUnresolved.make({ file, specifier });
  });

/** Every local file the entries run, the entries with them, and the variable imports met on the way. */
const importClosure = Effect.fn('cast.build.importClosure')(function* (
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
      const found = yield* importsOf(file, yield* fs.readFileString(file));
      for (const specifier of found.specifiers)
        next.push(...Option.toArray(yield* resolve(file, specifier)));
      for (const argument of found.variable) variable.push({ file, argument });
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

/**
 * A browser page's closure: its HTML file, and the closure of every script
 * and stylesheet it loads, each resolved from the page as an import is. A
 * page declares no variable import.
 */
export const pageClosure = Effect.fn('cast.build.pageClosure')(function* (page: string) {
  const fs = yield* FileSystem.FileSystem;
  const specifiers = yield* pageSpecifiers(page, yield* fs.readFileString(page));
  const entries: Array<string> = [];
  for (const specifier of specifiers)
    entries.push(...Option.toArray(yield* resolve(page, specifier)));
  const files = yield* declaredClosure(entries, []);
  return [...new Set([page, ...files])].toSorted();
});
