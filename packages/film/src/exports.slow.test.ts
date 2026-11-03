import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Array as Arr, Effect, FileSystem, Option, Path, Schema } from 'effect';
import {
  type ExportExportName,
  type ExportImportName,
  type ImportName,
  parseSync,
} from 'oxc-parser';

const TOOL_USERS: ReadonlySet<string> = new Set(['packages/film/src/tools/draw-check.ts']);

const SWEPT = [
  'packages/film/src/core/',
  'packages/film/src/lab/',
  'packages/film/src/tools/',
  'packages/film/src/canvas/',
  'packages/film/src/player/',
  'packages/film/src/browser/',
  'packages/film/src/command/',
  'packages/film/src/style/',
  'packages/film/lint/',
] as const;

const UNSWEPT = (file: string) =>
  file.endsWith('.types.ts') ||
  file.includes('/fixtures/films/') ||
  file.startsWith('packages/film/lint/fixtures/') ||
  file === 'packages/film/src/lab/fixtures/server-write-page.tsx';

const PackageExports = Schema.fromJsonString(
  Schema.Struct({ exports: Schema.Record(Schema.String, Schema.String) }),
);

const ENTRIES = [
  { entry: 'canvas', file: 'src/canvas/index.ts' },
  { entry: 'player', file: 'src/player/index.ts' },
  { entry: 'render', file: 'src/player/render.ts' },
  { entry: 'stand-in', file: 'src/canvas/fixtures/stand-in.ts' },
  { entry: 'core', file: 'src/core/index.ts' },
  { entry: 'style', file: 'src/style/index.ts' },
  { entry: 'style/build', file: 'src/style/build.ts' },
] as const;

interface Take {
  readonly from: string;
  readonly names: Option.Option<ReadonlyArray<string>>;
}

interface ModuleRecord {
  readonly exports: ReadonlyArray<string>;
  readonly takes: ReadonlyArray<Take>;
  readonly stars: ReadonlyArray<string>;
}

const nameOf = (entry: ImportName | ExportImportName | ExportExportName): Option.Option<string> => {
  if (entry.kind === 'Default') return Option.some('default');
  return Option.fromNullishOr(entry.name);
};

type Parsed = ReturnType<typeof parseSync>['module'];

const importTake = (i: Parsed['staticImports'][number]): Take => {
  if (i.entries.some((e) => e.importName.kind === 'NamespaceObject'))
    return { from: i.moduleRequest.value, names: Option.none() };
  return {
    from: i.moduleRequest.value,
    names: Option.some(i.entries.flatMap((e) => Option.toArray(nameOf(e.importName)))),
  };
};

const reexportTake = (e: Parsed['staticExports'][number]['entries'][number]): ReadonlyArray<Take> =>
  Option.toArray(
    Option.map(
      Option.filter(
        Option.fromNullishOr(e.moduleRequest),
        () => e.importName.kind !== 'AllButDefault',
      ),
      (request): Take => ({
        from: request.value,
        names: Option.map(nameOf(e.importName), (name) => [name]),
      }),
    ),
  );

const langOf = (file: string): 'ts' | 'tsx' => {
  if (file.endsWith('.tsx')) return 'tsx';
  return 'ts';
};

const dynamicTake = (source: string, d: Parsed['dynamicImports'][number]): ReadonlyArray<Take> =>
  Option.toArray(
    Option.map(
      Option.fromNullishOr(
        /^['"`]([^'"`]*)['"`]$/.exec(source.slice(d.moduleRequest.start, d.moduleRequest.end))?.[1],
      ),
      (from): Take => ({ from, names: Option.none() }),
    ),
  );

const recordOf = (file: string, source: string): ModuleRecord => {
  const { module } = parseSync(file, source, { lang: langOf(file), sourceType: 'module' });
  const entries = module.staticExports.flatMap((e) => e.entries);
  return {
    exports: entries.flatMap((e) => Option.toArray(nameOf(e.exportName))),
    takes: [
      ...module.staticImports.map(importTake),
      ...entries.flatMap(reexportTake),
      ...module.dynamicImports.flatMap((d) => dynamicTake(source, d)),
    ],
    stars: entries.flatMap((e) =>
      Option.toArray(
        Option.filter(
          Option.map(Option.fromNullishOr(e.moduleRequest), (r) => r.value),
          () => e.importName.kind === 'AllButDefault',
        ),
      ),
    ),
  };
};

const WHOLE = '*';

const isUser = (file: string) =>
  /\.tsx?$/.test(file) &&
  !file.includes('node_modules') &&
  !/^apps\/[^/]+\/out\//.test(file) &&
  (file.startsWith('apps/') || /\.test\.tsx?$/.test(file) || file.includes('/fixtures/'));

const inEntryScope = (file: string) =>
  file.startsWith('apps/') ||
  file.startsWith('packages/film/src/') ||
  file.startsWith('packages/film/e2e/') ||
  file.startsWith('packages/film/lint/fixtures/');

// oxlint-disable-next-line effect/noAsyncFunction -- built once as the file loads, so no case's time limit holds its cost
const graph = await Effect.runPromise(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = path.resolve(import.meta.dir, '../../..');
    const films = path.join(root, 'packages/film');
    const read = (dir: string) =>
      Effect.map(fs.readDirectory(path.join(root, dir), { recursive: true }), (found) =>
        found.map((f) => `${dir}/${f}`),
      );
    const files = Arr.filter(
      [
        ...(yield* read('apps')),
        ...(yield* read('packages/film/src')),
        ...(yield* read('packages/film/e2e')),
        ...(yield* read('packages/film/lint')),
      ],
      (file) =>
        /\.tsx?$/.test(file) && !file.includes('node_modules') && !/^apps\/[^/]+\/out\//.test(file),
    );
    const records = new Map<string, ModuleRecord>(
      yield* Effect.forEach(
        files,
        (file) =>
          Effect.map(
            fs.readFileString(path.join(root, file)),
            (source) => [file, recordOf(file, source)] as const,
          ),
        { concurrency: 64 },
      ),
    );
    return { root, films, records };
  }).pipe(Effect.provide(BunServices.layer)),
);

describe('the package entries', () => {
  it.effect('a comment or a string that looks like code hides nothing and names nothing', () =>
    Effect.sync(() => {
      const record = recordOf(
        'm.ts',
        [
          '// the routes under /lab/* answer the page',
          "import { kept } from './a.ts';",
          "const s = 'export const fake = 1';",
          'export const real = kept, also = 2;',
          '/** the end */',
          "export { other } from './b.ts';",
        ].join('\n'),
      );
      expect(record.exports).toEqual(['real', 'also', 'other']);
      expect(record.takes).toEqual([
        { from: './a.ts', names: Option.some(['kept']) },
        { from: './b.ts', names: Option.some(['other']) },
      ]);
    }),
  );

  it.effect('each names its exports, and exports only names its users import from it', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { root, films, records } = graph;
      const users = [...records].filter(
        ([file]) => inEntryScope(file) && (isUser(file) || TOOL_USERS.has(file)),
      );

      const found: Record<string, { readonly whole: boolean; readonly unused: string[] }> = {};
      for (const { entry, file } of ENTRIES) {
        const at = path.join(films, file);
        const own = recordOf(at, yield* fs.readFileString(at));
        const used = new Set<string>();
        for (const [user, record] of users) {
          if (path.join(root, user) === at) continue;
          for (const take of record.takes) {
            const fromEntry =
              take.from === `@manna/film/${entry}` ||
              (take.from.startsWith('.') &&
                path.resolve(path.dirname(path.join(root, user)), take.from) === at);
            if (fromEntry)
              for (const name of Option.getOrElse(take.names, () => [WHOLE])) used.add(name);
          }
        }
        found[entry] = {
          whole: own.stars.length > 0,
          unused: own.exports.filter((name) => !used.has(name) && !used.has(WHOLE)),
        };
      }
      expect(found).toEqual(
        Object.fromEntries(ENTRIES.map(({ entry }) => [entry, { whole: false, unused: [] }])),
      );
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect('every module in a swept directory exports only names another file imports', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { root, films, records } = graph;
      const specifiers = yield* Schema.decodeEffect(PackageExports)(
        yield* fs.readFileString(path.join(films, 'package.json')),
      );

      const resolved = (user: string, from: string): Option.Option<string> => {
        if (from.startsWith('.'))
          return Option.some(path.relative(root, path.resolve(root, path.dirname(user), from)));
        if (from !== '@manna/film' && !from.startsWith('@manna/film/')) return Option.none();
        return Option.map(
          Option.fromUndefinedOr(specifiers.exports[`.${from.slice('@manna/film'.length)}`]),
          (file) => path.join('packages/film', file),
        );
      };
      const stars = new Map<string, ReadonlyArray<string>>();
      for (const [file, record] of records)
        stars.set(
          file,
          record.stars.flatMap((from) => Option.toArray(resolved(file, from))),
        );
      const used = new Set<string>();
      const take = (module: string, name: string) => {
        used.add(`${module}#${name}`);
        for (const star of stars.get(module) ?? []) used.add(`${star}#${name}`);
      };
      for (const [user, record] of records)
        for (const { names, from } of record.takes)
          for (const module of Option.toArray(resolved(user, from)))
            if (module !== user)
              for (const name of Option.getOrElse(names, () => [WHOLE])) take(module, name);

      const unused = [...records]
        .filter(
          ([file]) =>
            SWEPT.some((dir) => file.startsWith(dir)) &&
            !/\.test\.tsx?$/.test(file) &&
            !UNSWEPT(file),
        )
        .flatMap(([file, record]) =>
          record.exports
            .filter(
              (name) =>
                name !== 'default' && !used.has(`${file}#${name}`) && !used.has(`${file}#${WHOLE}`),
            )
            .map((name) => `${file.slice('packages/film/'.length)} ${name}`),
        );
      expect(unused).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
