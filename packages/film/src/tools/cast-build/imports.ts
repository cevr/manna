import { Effect, FileSystem, Option, Path, Predicate, Schema } from 'effect';
import { Visitor, parseSync } from 'oxc-parser';
import { pageSpecifiers } from './page-html.ts';

export class ImportsUnparsed extends Schema.TaggedError<ImportsUnparsed>()('ImportsUnparsed', {
  file: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.file} does not parse: ${this.reason}`;
  }
}

const langOf = (file: string) => {
  if (file.endsWith('.tsx')) return 'tsx';
  if (file.endsWith('.jsx')) return 'jsx';
  if (/\.[cm]?ts$/.test(file)) return 'ts';
  return 'js';
};

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

interface VariableImport {
  readonly file: string;
  readonly argument: string;
}

interface Closure {
  readonly files: ReadonlyArray<string>;
  readonly variable: ReadonlyArray<VariableImport>;
}

export class UndeclaredImport extends Schema.TaggedError<UndeclaredImport>()('UndeclaredImport', {
  file: Schema.String,
  argument: Schema.String,
}) {
  override get message() {
    return `${this.file} imports \`${this.argument}\`, which no declaration beside the stage names`;
  }
}

export class ImportUnresolved extends Schema.TaggedError<ImportUnresolved>()('ImportUnresolved', {
  file: Schema.String,
  specifier: Schema.String,
}) {
  override get message() {
    return `${this.file} imports '${this.specifier}', which names no file`;
  }
}

const SCRIPT = /\.(?:[cm]?[jt]sx?)$/;

const TS_NAMES = {
  '.js': ['.ts', '.tsx'],
  '.jsx': ['.tsx', '.ts'],
  '.mjs': ['.mts'],
  '.cjs': ['.cts'],
} as const satisfies Readonly<Record<string, ReadonlyArray<string>>>;

const tsNamesOf = (ext: string): ReadonlyArray<string> =>
  Object.entries(TS_NAMES).find(([js]) => js === ext)?.[1] ?? [];

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

const WORKSPACE = /^(@manna\/[^/]+)(\/.*)?$/;

const PackageExports = Schema.Struct({
  exports: Schema.Record(Schema.String, Schema.String),
});
const decodeExports = Schema.decodeUnknownEffect(Schema.fromJsonString(PackageExports));

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

export const declaredClosure = Effect.fn('cast.build.declaredClosure')(function* (
  entries: ReadonlyArray<string>,
  declared: ReadonlyArray<string>,
) {
  const closure = yield* importClosure(entries);
  for (const site of closure.variable)
    if (!declared.includes(site.file)) return yield* UndeclaredImport.make(site);
  return closure.files;
});

export const pageClosure = Effect.fn('cast.build.pageClosure')(function* (page: string) {
  const fs = yield* FileSystem.FileSystem;
  const specifiers = yield* pageSpecifiers(page, yield* fs.readFileString(page));
  const entries: Array<string> = [];
  for (const specifier of specifiers)
    entries.push(...Option.toArray(yield* resolve(page, specifier)));
  const files = yield* declaredClosure(entries, []);
  return [...new Set([page, ...files])].toSorted();
});
