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
  const written = path.replace(/\.js$/, '.ts').replace(/\.jsx$/, '.tsx');
  return Option.fromUndefinedOr(
    [...SUFFIXES.map((suffix) => `${path}${suffix}`), written].find(
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
 * The repo's file an import names from `from` (a path from the root): a
 * relative one by its path, a workspace package's (`@manna/core/search`)
 * by its `exports`, or by its folder when it has none. None for a package
 * of `node_modules`, a builtin, or a file that is not a module bun runs.
 */
export const resolverOf =
  (files: ReadonlySet<string>, packages: ReadonlyArray<Package>) =>
  (from: string, specifier: string): Option.Option<string> => {
    if (specifier.startsWith('./') || specifier.startsWith('../'))
      return Option.flatMap(
        normal(`${from.split('/').slice(0, -1).join('/')}/${specifier}`),
        (path) => fileAt(files, path),
      );
    return Option.flatMap(
      Option.fromUndefinedOr(
        packages.find(({ name }) => specifier === name || specifier.startsWith(`${name}/`)),
      ),
      ({ name, dir, exports }) => {
        const subpath = `.${specifier.slice(name.length)}`;
        const path = Option.match(
          Option.liftPredicate(exports, (e) => Object.keys(e).length > 0),
          {
            onNone: () => Option.some(subpath),
            onSome: (given) => exported(given, subpath),
          },
        );
        return Option.flatMap(
          Option.flatMap(path, (at) => normal(`${dir}/${at}`)),
          (at) => fileAt(files, at),
        );
      },
    );
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
  const seen = new Set([start]);
  const queue = [start];
  for (let at = 0; at < queue.length; at++) {
    const file = queue[at] ?? '';
    Option.map(Option.fromUndefinedOr(graph.get(file)), ({ reads, deps }) => {
      if (!product.has(file)) for (const name of reads) if (!found.has(name)) found.set(name, file);
      for (const dep of deps)
        if (!seen.has(dep)) {
          seen.add(dep);
          queue.push(dep);
        }
    });
  }
  return found;
};
