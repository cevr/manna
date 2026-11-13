import { Option, Predicate } from 'effect';

/** A workspace package a module may import by name: its name, its folder from the root, and its `exports`. */
export interface Package {
  readonly name: string;
  readonly dir: string;
  readonly exports: Readonly<Record<string, string>>;
}

/** The extensions of a module bun runs: what an import is followed into. */
const MODULE = /\.(?:[cm]?[jt]s|[jt]sx)$/;

/** The files a path without its extension may name, as bun resolves it, in its order. */
const SUFFIXES = [
  '',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mts',
  '.mjs',
  '/index.ts',
  '/index.tsx',
  '/index.js',
];

/** A path from the root with its `.` and `..` parts resolved; none when it leaves the root. */
const normal = (path: string): Option.Option<string> => {
  const parts: Array<string> = [];
  for (const part of path.split('/')) {
    if (part === '..') {
      if (parts.length === 0) return Option.none();
      parts.pop();
    } else if (part !== '' && part !== '.') parts.push(part);
  }
  return Option.some(parts.join('/'));
};

/** The first file of `files` a path names: itself, with an extension or an index, or a `.js` written for its `.ts`. */
const fileAt = (files: ReadonlySet<string>, path: string): Option.Option<string> => {
  const stem = path.replace(/\.[cm]?jsx?$/, '');
  const written = ['.ts', '.tsx', '.mts'].filter(() => stem !== path).map((ext) => `${stem}${ext}`);
  return Option.fromUndefinedOr(
    [...SUFFIXES.map((suffix) => `${path}${suffix}`), ...written].find(
      (candidate) => MODULE.test(candidate) && files.has(candidate),
    ),
  );
};

/** The path a package's `exports` gives a subpath (`.`, `./search`), a `*` entry's included. */
const exported = (exports: Readonly<Record<string, string>>, subpath: string) =>
  Option.orElse(Option.fromUndefinedOr(exports[subpath]), () =>
    Option.firstSomeOf(
      Object.entries(exports).map(([key, entry]) => {
        const [head = '', tail, ...more] = key.split('*');
        if (!Predicate.isString(tail) || more.length > 0) return Option.none();
        if (!subpath.startsWith(head) || !subpath.endsWith(tail)) return Option.none();
        const star = subpath.slice(head.length, subpath.length - tail.length);
        return Option.some(entry.replaceAll('*', star));
      }),
    ),
  );

/**
 * A tsconfig's `paths`, as bun reads them for the modules under it: each
 * pattern (`~/*`) with its targets, and the folder from the root the
 * targets lie in (its `baseUrl`, else the folder of the tsconfig that sets
 * the `paths`).
 */
interface Aliases {
  readonly base: string;
  readonly paths: Readonly<Record<string, ReadonlyArray<string>>>;
}

/** What the resolver reads of a `tsconfig.json`: what it extends, and its `baseUrl` and `paths`. */
interface TsconfigPaths {
  readonly extends?: string;
  readonly compilerOptions?: {
    readonly baseUrl?: string;
    readonly paths?: Readonly<Record<string, ReadonlyArray<string>>>;
  };
}

/** The folder of a path from the root (`''` for a file at the root). */
const folderOf = (file: string) => file.split('/').slice(0, -1).join('/');

/**
 * The `paths` bun resolves a module's imports by: those of the
 * `tsconfig.json` nearest it (`tsconfigs`, by their paths from the root),
 * or of the one it extends, transitively, when it sets none; a `paths`
 * replaces the one it extends, as TypeScript reads it. None when no
 * tsconfig above the module sets any.
 */
export const aliasesFor =
  (tsconfigs: ReadonlyMap<string, TsconfigPaths>) =>
  (from: string): Option.Option<Aliases> => {
    const of = (file: string, seen: ReadonlySet<string>): Option.Option<Aliases> =>
      Option.flatMap(
        Option.filter(Option.fromUndefinedOr(tsconfigs.get(file)), () => !seen.has(file)),
        (config) => {
          const dir = folderOf(file);
          const set = Option.flatMap(Option.fromUndefinedOr(config.compilerOptions), (options) =>
            Option.flatMap(Option.fromUndefinedOr(options.paths), (paths) =>
              Option.map(normal(`${dir}/${options.baseUrl ?? '.'}`), (base) => ({ base, paths })),
            ),
          );
          return Option.orElse(set, () =>
            Option.flatMap(
              Option.flatMap(Option.fromUndefinedOr(config.extends), (parent) =>
                normal(`${dir}/${parent}`),
              ),
              (parent) => of(parent, new Set([...seen, file])),
            ),
          );
        },
      );
    const parts = folderOf(from)
      .split('/')
      .filter((part) => part !== '');
    for (let depth = parts.length; depth >= 0; depth--) {
      const file = [...parts.slice(0, depth), 'tsconfig.json'].join('/');
      if (tsconfigs.has(file)) return of(file, new Set());
    }
    return Option.none();
  };

/** What an import names: a module of the repo, something else that is there (a builtin, an installed package, a data file), or nothing. */
type Resolved =
  | { readonly _tag: 'Module'; readonly file: string }
  | { readonly _tag: 'Other' }
  | { readonly _tag: 'Unresolved' };

const OTHER: Resolved = { _tag: 'Other' };
const UNRESOLVED: Resolved = { _tag: 'Unresolved' };

/** What the resolver knows of the repo. */
interface Repo {
  /** Every file of the repo, from the root. */
  readonly files: ReadonlySet<string>;
  readonly packages: ReadonlyArray<Package>;
  /** The `paths` of the tsconfig nearest a module, which bun resolves its imports by. */
  readonly aliasesFor: (from: string) => Option.Option<Aliases>;
  /** Whether a package of that name is installed where a module there finds it (a `node_modules` above it). */
  readonly installed: (from: string, name: string) => boolean;
  /** The runtime's own modules (`fs`, `path`), beside the `node:` and `bun:` ones. */
  readonly builtins: ReadonlySet<string>;
}

/** What a path from the root names: a module (by bun's suffixes), another file of the repo, or nothing. */
const atPath = (files: ReadonlySet<string>, path: string): Resolved =>
  Option.match(fileAt(files, path), {
    onSome: (file): Resolved => ({ _tag: 'Module', file }),
    onNone: () => [OTHER].find(() => files.has(path)) ?? UNRESOLVED,
  });

/** What the first of `paths` that names something names, from `base`; nothing when none does. */
const firstAt = (files: ReadonlySet<string>, base: string, paths: ReadonlyArray<string>) =>
  paths
    .map((target) =>
      Option.match(normal(`${base}/${target}`), {
        onNone: () => UNRESOLVED,
        onSome: (path) => atPath(files, path),
      }),
    )
    .find((resolved) => resolved._tag !== 'Unresolved') ?? UNRESOLVED;

/** The targets a `paths` alias gives a specifier, `*` filled in; none when no pattern matches. */
const aliased = (aliases: Aliases, specifier: string): Option.Option<ReadonlyArray<string>> =>
  Option.firstSomeOf(
    Object.entries(aliases.paths).map(([pattern, targets]) => {
      const [head = '', tail, ...more] = pattern.split('*');
      if (!Predicate.isString(tail)) return Option.liftPredicate(targets, () => specifier === head);
      if (more.length > 0 || !specifier.startsWith(head) || !specifier.endsWith(tail))
        return Option.none();
      const star = specifier.slice(head.length, specifier.length - tail.length);
      return Option.some(targets.map((target) => target.replaceAll('*', star)));
    }),
  );

/** A bare specifier's package name: `@scope/name` or `name`. */
const packageName = (specifier: string) =>
  specifier
    .split('/')
    .slice(0, 1 + Number(specifier.startsWith('@')))
    .join('/');

/**
 * What an import names from `from` (a path from the root), resolved as bun
 * resolves it: a builtin (`node:`, `bun:`, `bun`, the runtime's own); a
 * relative path; a `paths` alias of the tsconfig nearest `from`; a
 * workspace package (`@manna/core/search`) by its `exports`, or its folder
 * when it has none; an installed package. A specifier that none of these
 * names is `Unresolved`, which the check fails on: an import it cannot
 * follow is a module whose reads it cannot see.
 */
export const resolverOf =
  (repo: Repo) =>
  (from: string, written: string): Resolved => {
    const specifier = written.split('?')[0] ?? '';
    const folder = from.split('/').slice(0, -1).join('/');
    if (
      /^(?:node|bun):/.test(specifier) ||
      specifier === 'bun' ||
      repo.builtins.has(specifier) ||
      /^[a-z][a-z0-9+.-]*:/.test(specifier) ||
      specifier.startsWith('/')
    )
      return OTHER;
    if (specifier.startsWith('./') || specifier.startsWith('../') || specifier === '.')
      return Option.match(normal(`${folder}/${specifier}`), {
        onNone: () => UNRESOLVED,
        onSome: (path) => atPath(repo.files, path),
      });
    const alias = Option.flatMap(repo.aliasesFor(from), (aliases) =>
      Option.map(aliased(aliases, specifier), (targets) => ({ base: aliases.base, targets })),
    );
    const viaAlias = Option.match(alias, {
      onNone: () => UNRESOLVED,
      onSome: ({ base, targets }) => firstAt(repo.files, base, targets),
    });
    if (viaAlias._tag !== 'Unresolved') return viaAlias;
    const workspace = repo.packages.find(
      ({ name }) => specifier === name || specifier.startsWith(`${name}/`),
    );
    return Option.match(Option.fromUndefinedOr(workspace), {
      onSome: (workspace) => {
        const subpath = `.${specifier.slice(workspace.name.length)}`;
        if (Object.keys(workspace.exports).length === 0)
          return firstAt(repo.files, workspace.dir, [subpath]);
        return Option.match(exported(workspace.exports, subpath), {
          onNone: () => UNRESOLVED,
          onSome: (target) => firstAt(repo.files, workspace.dir, [target]),
        });
      },
      onNone: () => [OTHER].find(() => repo.installed(from, packageName(specifier))) ?? UNRESOLVED,
    });
  };

/** A module of the graph: the variables it reads, and the repo's modules it imports. */
export interface Module {
  readonly reads: ReadonlyArray<string>;
  readonly deps: ReadonlyArray<string>;
  /** Whether it runs as a program when it is the one started (`import.meta.main`): a CLI, a script. */
  readonly entry: boolean;
}

/** Whether a path names a module bun runs (`.ts`, `.tsx`, `.js`, `.mjs` …). */
export const isModule = (file: string) => MODULE.test(file);

/** The folders whose modules are the tests' own: a test's rigs, fixtures and harnesses. */
const TEST_FOLDERS = new Set(['test', 'tests', '__tests__', 'fixtures', 'e2e']);

/** Whether a module is the tests' own by where it lies: under a `TEST_FOLDERS` folder, or a `testing` module. */
export const isTestSupport = (file: string) => {
  const parts = file.split('/');
  return (
    parts.slice(0, -1).some((part) => TEST_FOLDERS.has(part)) ||
    /^testing\.[^.]+$|\.testing\.[^.]+$/.test(parts.at(-1) ?? '')
  );
};

/**
 * The modules the product runs: each a root of the product reaches by its
 * imports, transitively, a root being a module no module imports (an app's
 * entry, a config) or one that runs as a program (`entry`: a CLI, a script,
 * though a test imports what it exports), neither a test nor the tests' own
 * (`ofTests`),
 * and the walk entering none of the tests' own. A variable such a module
 * reads is the product's setting, read under a test only where the test
 * builds that part of the product: the test hands it its own (a
 * `ConfigProvider`, a layer), and turbo dropping the caller's is what keeps
 * the test from the caller's settings and keys.
 */
export const productOf = (
  graph: ReadonlyMap<string, Module>,
  ofTests: (file: string) => boolean,
): ReadonlySet<string> => {
  const imported = new Set([...graph.values()].flatMap(({ deps }) => deps));
  const queue = [...graph]
    .filter(([file, { entry }]) => (entry || !imported.has(file)) && !ofTests(file))
    .map(([file]) => file);
  const product = new Set(queue);
  for (let at = 0; at < queue.length; at++)
    for (const dep of graph.get(queue[at] ?? '')?.deps ?? [])
      if (!product.has(dep) && !ofTests(dep)) {
        product.add(dep);
        queue.push(dep);
      }
  return product;
};

/** The modules of the repo `start` loads when it runs: itself, then what it imports, transitively, nearest first. */
export const loadedBy = (start: string, graph: ReadonlyMap<string, Module>) => {
  const seen = new Set([start]);
  const queue = [start];
  for (let at = 0; at < queue.length; at++) {
    const file = queue[at] ?? '';
    Option.map(Option.fromUndefinedOr(graph.get(file)), ({ deps }) => {
      for (const dep of deps)
        if (!seen.has(dep)) {
          seen.add(dep);
          queue.push(dep);
        }
    });
  }
  return queue;
};

/**
 * Each variable `start` reads when it runs, by itself or through any module
 * of the repo it imports, transitively, with the first module found to read
 * it (`start` itself before what it imports). A module of the product
 * (`productOf`) is followed but its reads are not counted.
 */
export const readsThrough = (
  start: string,
  graph: ReadonlyMap<string, Module>,
  product: ReadonlySet<string>,
): ReadonlyMap<string, string> => {
  const found = new Map<string, string>();
  for (const file of loadedBy(start, graph))
    if (!product.has(file))
      for (const name of Option.match(Option.fromUndefinedOr(graph.get(file)), {
        onNone: () => [],
        onSome: ({ reads }) => reads,
      }))
        if (!found.has(name)) found.set(name, file);
  return found;
};
